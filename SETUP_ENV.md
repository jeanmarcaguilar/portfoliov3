# Setup Your .env File

Since the `.env` file is protected by gitignore, you need to create/update it manually.

## Instructions

1. Open the `.env` file in your project root (create it if it doesn't exist)
2. Add the following content:

```env
# Contact Form Configuration
VITE_CONTACT_ENDPOINT=https://formspree.io/f/mvkzpjeg

# Visitor Tracking Configuration
GMAIL_USER=jeanmarcaguilar27@gmail.com
GMAIL_APP_PASSWORD=igzz tgcd msrc imxa
VISITOR_NOTIFICATION_EMAIL=jeanmarcaguilar27@gmail.com
```

3. Save the file

## Running with Email Notifications

After setting up the `.env` file, run:

```bash
npm run dev:full
```

This will start both the Vite dev server (port 5173) and the API server (port 3000) simultaneously.

Visit `http://localhost:5173` to test the visitor tracking with actual email notifications.
