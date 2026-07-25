# DALUCI Sales and Ads Dashboard

A responsive, web-based dashboard application designed to visualize and track sales performance, runrates, and ad spends across different channels for DALUCI.

## Features

- **Secure API Authentication**: Connect securely by entering your Bearer Token, which is saved locally in your browser.
- **Data Visualization**: View real-time data across four main sections:
  - Channel-wise Sales Performance (GMV, Orders, Contribution)
  - Projected Monthly Runrate
  - Ads Spend by Channel (Yesterday vs This Month)
  - Date of Last Data Upload
- **Modern Responsive UI**: Fully responsive design with a light, warm aesthetic, featuring skeleton loaders during data fetch operations.
- **Reporting Tools**: Built-in functionality to take quick snapshots of the dashboard and send them directly via email.
- **Inline Editing**: Features inline editable cells for certain parameters (like Upload Dates).

## Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Local Dev Server**: Python 3 (`http.server`) acting as an API proxy
- **Deployment**: Configured for deployment on Vercel (includes `vercel.json` and a Node.js-based `/api/send-snapshot` serverless function).

## Local Development Setup

To run this dashboard locally, you'll need Python 3 installed.

1. **Clone the repository** (or download the files).
2. **Start the local proxy server**:
   Open a terminal in the project directory and run:
   ```bash
   python server.py
   ```
   *This starts a local Python HTTP server on port 8085 that statically serves the files and proxies `/api/*` requests to the real backend (`https://daluci.digital.dhineu.com`) to bypass CORS.*
3. **Open the App**:
   Navigate to [http://localhost:8085](http://localhost:8085) in your web browser.
4. **Authenticate**:
   Enter your Bearer Token in the authentication prompt to connect to the API.

## Project Structure

- `index.html`: The main markup for the dashboard, including the authentication screen and the connected dashboard layout.
- `style.css`: All styling, including the responsive layout, table designs, light/warm color themes, and CSS animations.
- `app.js`: Client-side logic for handling API calls, parsing responses, injecting data into the DOM, capturing snapshots, and managing local storage.
- `server.py`: A simple Python HTTP Server that proxies API requests.
- `package.json`: Contains project dependencies (such as `nodemailer` for the serverless function).
- `vercel.json`: Deployment configuration for Vercel.
- `/api/`: Contains serverless functions (like snapshot mailing).

## License

Confidential and Proprietary. All rights reserved.
