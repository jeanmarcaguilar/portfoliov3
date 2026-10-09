# Visitor Tracking Setup Guide

This guide will help you set up visitor tracking with Gmail notifications for your portfolio.

## Overview

The visitor tracking system captures:
- IP address
- Approximate location (city, country, region, coordinates)
- Device information (type, model, vendor)
- Operating system (name, version)
- Browser (name, version)
- Screen resolution
- Visit timestamp
- User agent string

## Step 1: Generate Gmail App Password

Since 2022, Gmail requires App Passwords for third-party app access. Follow these steps:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled
3. Under "2-Step Verification", click **App passwords**
4. Click **Select app** → Choose "Mail" or "Other (Custom name)" → Enter "Portfolio Tracker"
5. Click **Select device** → Choose "Other (Custom name)" → Enter "Portfolio"
6. Click **Generate**
7. Copy the 16-character password (it won't be shown again)

## Step 2: Configure Environment Variables

### For Local Development (localhost)

Create or update your `.env` file in the project root:

```env
# Contact Form Configuration
VITE_CONTACT_ENDPOINT=https://formspree.io/f/mvkzpjeg

# Visitor Tracking Configuration
GMAIL_USER=jeanmarcaguilar27@gmail.com
GMAIL_APP_PASSWORD=igzz tgcd msrc imxa
VISITOR_NOTIFICATION_EMAIL=jeanmarcaguilar27@gmail.com
```

**Important:** Never commit the `.env` file to version control. It's already in `.gitignore`.

### For Vercel Deployment

Add the following environment variables in your Vercel project settings:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `GMAIL_USER` | jeanmarcaguilar27@gmail.com | Your Gmail address |
| `GMAIL_APP_PASSWORD` | igzz tgcd msrc imxa | The 16-character app password (including spaces) |
| `VISITOR_NOTIFICATION_EMAIL` | jeanmarcaguilar27@gmail.com | Email to receive notifications (optional, defaults to GMAIL_USER) |

## Step 3: Running Locally with API Support

To test visitor tracking on localhost with actual email notifications:

### Option A: Using the Express Server (Recommended for Testing)

1. Build the project:
```bash
npm run build
```

2. Run the Express server:
```bash
npm run dev:server
```

3. Visit `http://localhost:5173`

The Express server will handle API requests and send emails.

### Option B: Regular Vite Dev Server

For regular development without email notifications:
```bash
npm run dev
```

Note: The API endpoint won't work with `npm run dev` alone - you need the Express server for API functionality.

## Step 4: Deploy to Vercel

After setting up the environment variables:

1. Push your changes to GitHub
2. Vercel will automatically redeploy
3. The API endpoint will be available at `https://your-domain.com/api/track-visitor`

## How It Works

1. When a visitor loads your portfolio, `trackVisitor()` is called in `src/main.tsx`
2. The client collects visitor data (IP, location, device info, etc.)
3. Data is sent to the API endpoint at `/api/track-visitor`
4. The API function sends a formatted email via Gmail
5. Session storage prevents duplicate tracking for the same visitor

## Testing

### Local Development with Express Server

1. Add your credentials to `.env`
2. Run `npm run build`
3. Run `npm run dev:server`
4. Visit `http://localhost:5173`
5. Check your Gmail for the notification email

### Production Testing

1. Deploy to Vercel
2. Visit your portfolio
3. Check your Gmail for the notification email

## Privacy Considerations

- This system collects IP addresses and approximate location data
- Visitors are tracked once per session (using sessionStorage)
- Consider adding a privacy policy disclosure on your site
- You may want to add an opt-out mechanism for GDPR compliance

## Troubleshooting

### Email Not Sending

- Verify Gmail app password is correct (including spaces)
- Check that 2-Step Verification is enabled on your Google account
- Ensure environment variables are set correctly in `.env` or Vercel
- Check server logs for errors

### Location Data Missing

- The IP geolocation service (ip-api.com) is free and may have rate limits
- Some IP addresses may not have location data available

### Device Info Incomplete

- Some devices may not report all information in the user agent string
- Mobile devices sometimes report generic device models

### API Endpoint Not Working on Localhost

- Make sure you're using `npm run dev:server` (not `npm run dev`)
- Ensure the `.env` file exists with correct credentials
- Check that port 5173 is not already in use

## Customization

### Modify Email Template

Edit `api/track-visitor.js` to customize the email HTML template.

### Change Tracking Behavior

Edit `src/utils/visitorTracker.ts` to:
- Track on every page load (remove sessionStorage check)
- Add additional data points
- Change the IP geolocation service
