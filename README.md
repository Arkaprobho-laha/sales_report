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
- **Local Dev Server**: Vercel CLI
- **Deployment**: Configured for deployment on Vercel (includes `vercel.json` and a Node.js-based `/api/send-snapshot` serverless function).

### 1. Local Development (Vercel)

You can run this project locally using the Vercel CLI, which will also run the serverless functions (`api/` folder).

1. Install Vercel CLI (if not installed):
   ```bash
   npm i -g vercel
   ```
2. Link the project and pull env vars:
   ```bash
   vercel link
   vercel env pull .env.development.local
   ```
3. Start the dev server:
   ```bash
   vercel dev
   ```
   Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

### 2. Deployment

This project is configured to be deployed directly to Vercel. 
Just connect the GitHub repository to Vercel and it will automatically deploy the frontend and the Node.js serverless functions.

## Project Structure

- `index.html`: The main markup for the dashboard, including the authentication screen and the connected dashboard layout.
- `style.css`: All styling, including the responsive layout, table designs, light/warm color themes, and CSS animations.
- `app.js`: Client-side logic for handling API calls, parsing responses, injecting data into the DOM, capturing snapshots, and managing local storage.
- `package.json`: Contains project dependencies (such as `nodemailer` for the serverless function).
- `vercel.json`: Deployment configuration for Vercel.
- `/api/`: Contains serverless functions (like snapshot mailing).

## License

Confidential and Proprietary. All rights reserved.
