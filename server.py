import http.server
import urllib.request
import urllib.error
import sys
import os

PORT = int(os.environ.get("PORT", 8085))

# The real dashboard API. The browser never talks to this host directly —
# it always calls same-origin /api/... and this proxy forwards the request,
# passing through whatever Authorization header the browser sent. The
# token is never stored or logged here.
TARGET_API = "https://daluci.digital.dhineu.com"


import sqlite3
import pandas as pd
import json
import urllib.parse
from datetime import datetime
import io

# Ensure DB is created in the same folder as server.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, 'meesho_ads.db')

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS meesho_ads (
            date TEXT,
            brand TEXT,
            ad_spend REAL,
            UNIQUE(date, brand)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" %
                          (self.client_address[0],
                           self.log_date_time_string(),
                           format % args))
        sys.stderr.flush()

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_request('GET')
        else:
            blocked_extensions = ('.py', '.pyc', '.env', '.cfg', '.ini', '.sh', '.bat')
            path_lower = self.path.split('?')[0].lower()
            if any(path_lower.endswith(ext) for ext in blocked_extensions):
                self.send_error(403, 'Forbidden')
                return
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/v1/upload-meesho-ads'):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                file_data = self.rfile.read(content_length)
                
                df = pd.read_excel(io.BytesIO(file_data))
                # Convert Date to string YYYY-MM-DD
                if 'Date' in df.columns:
                    df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
                else:
                    raise Exception("Missing 'Date' column in Excel")
                
                if 'Account Name' not in df.columns or 'Ad Spend' not in df.columns:
                    raise Exception("Missing 'Account Name' or 'Ad Spend' columns in Excel")
                
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                
                for date_str, date_group in df.groupby('Date'):
                    total_all = float(date_group['Ad Spend'].sum())
                    total_daluci = 0.0  # Meesho ads should have Daluci brand as blank
                    
                    c.execute('REPLACE INTO meesho_ads (date, brand, ad_spend) VALUES (?, ?, ?)', (date_str, 'ALL', total_all))
                    c.execute('REPLACE INTO meesho_ads (date, brand, ad_spend) VALUES (?, ?, ?)', (date_str, 'DALUCI', total_daluci))
                
                conn.commit()
                conn.close()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"success": true}')
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(('{"error": "%s"}' % str(e).replace('"', "'")).encode('utf-8'))
            return
        elif self.path.startswith('/api/send-snapshot'):
            body = (
                '{"error": "Email sending only works on Vercel (this local '
                'Python server can\'t run the Node send-snapshot function). '
                'Use `vercel dev` or a deployed preview to test emailing."}'
            ).encode('utf-8')
            self.send_response(501)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith('/api/'):
            self.proxy_request('POST')
        else:
            self.send_error(404, 'Not Found')

    def do_OPTIONS(self):
        if self.path.startswith('/api/'):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
            self.end_headers()
        else:
            super().do_OPTIONS()

    def proxy_request(self, method):
        target_path = '/bff' + self.path[len('/api'):]
        url = TARGET_API + target_path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        headers = {}
        for header, value in self.headers.items():
            if header.lower() not in ('host', 'content-length', 'connection'):
                headers[header] = value

        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                status = response.status
                out_headers = []
                for header, value in response.getheaders():
                    if header.lower() not in ('transfer-encoding', 'content-length'):
                        out_headers.append((header, value))
                res_data = response.read()
                
                # INTERCEPT MEESHO ADS
                if method == 'GET' and 'platform=Meesho' in target_path and '/sales-details-totals' in target_path:
                    try:
                        parsed_url = urllib.parse.urlparse(target_path)
                        query_params = urllib.parse.parse_qs(parsed_url.query)
                        
                        start_date = query_params.get('startDate', [''])[0]
                        end_date = query_params.get('endDate', [''])[0]
                        brand_filter = query_params.get('brand', [''])[0]
                        
                        if start_date and end_date:
                            db_brand = 'DALUCI' if brand_filter == 'Daluci' else 'ALL'
                            
                            conn = sqlite3.connect(DB_FILE)
                            c = conn.cursor()
                            c.execute('SELECT SUM(ad_spend) FROM meesho_ads WHERE date >= ? AND date <= ? AND brand = ?', (start_date, end_date, db_brand))
                            row = c.fetchone()
                            ad_spend = row[0] if row and row[0] is not None else 0.0
                            conn.close()
                            
                            json_data = json.loads(res_data)
                            if 'data' in json_data and json_data['data'] is not None:
                                json_data['data']['totalAdsSpend'] = ad_spend
                                if db_brand == 'ALL':
                                    json_data['data']['totalAdsSpendAll'] = ad_spend
                            res_data = json.dumps(json_data).encode('utf-8')
                    except Exception as e:
                        print("Error intercepting Meesho ads:", e)
                        
                # INTERCEPT UPLOAD DATES
                if method == 'GET' and '/sales/last-upload-dates' in target_path:
                    try:
                        conn = sqlite3.connect(DB_FILE)
                        c = conn.cursor()
                        c.execute('SELECT MAX(date) FROM meesho_ads WHERE brand = "ALL"')
                        row = c.fetchone()
                        max_date = row[0] if row and row[0] is not None else None
                        conn.close()
                        
                        if max_date:
                            json_data = json.loads(res_data)
                            for p in json_data.get('data', []):
                                if p.get('platform') == 'Meesho':
                                    if 'ads' not in p:
                                        p['ads'] = {}
                                    p['ads']['actualLastUpload'] = max_date
                            res_data = json.dumps(json_data).encode('utf-8')
                    except Exception as e:
                        print("Error intercepting last upload dates:", e)

                self.send_response(status)
                for header, value in out_headers:
                    self.send_header(header, value)
                self.send_header('Content-Length', str(len(res_data)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(res_data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for header, value in e.headers.items():
                if header.lower() not in ('transfer-encoding', 'content-length'):
                    self.send_header(header, value)
            res_data = e.read()
            self.send_header('Content-Length', str(len(res_data)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(res_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(('{"error": "%s"}' % str(e).replace('"', "'")).encode('utf-8'))


from http.server import ThreadingHTTPServer

if __name__ == '__main__':
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadingHTTPServer(server_address, ProxyHTTPRequestHandler)
    print(f"DALUCI dashboard proxy active at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutdown proxy server.")
        sys.exit(0)
