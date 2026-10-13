# API Security Setup Guide

This guide will help you secure your portfolio's APIs using a hybrid approach with Supabase RLS policies and your Express server.

## 📋 Steps to Complete

### Step 1: Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy these values:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **anon public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
   - **service_role key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` - THIS IS SECRET)

### Step 2: Generate API Key for Express Server

Run this command in your terminal to generate a secure API key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output - you'll need it for the next step.

### Step 3: Configure Your Local Environment

Create a `.env` file in your project root (this file is gitignored) and add:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# API Security
API_KEY=your-generated-api-key-here
VITE_API_KEY=your-generated-api-key-here

# Contact Form
VITE_CONTACT_ENDPOINT=https://formspree.io/f/YOUR_FORMSPREE_FORM_ID

# Gmail Configuration
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password-here
VISITOR_NOTIFICATION_EMAIL=your-email@gmail.com
```

### Step 4: Configure Production Environment Variables

If you're deploying to Vercel or another platform:

1. Go to your deployment platform settings
2. Add the same environment variables from Step 3
3. **Important**: For production, use separate API keys and passwords

### Step 5: Set Up Supabase Row Level Security (RLS)

Go to your Supabase Dashboard and configure RLS policies for each table:

#### Example: Visitor Tracking Table

```sql
-- Enable RLS
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

-- Allow public reads (for analytics)
CREATE POLICY "Public read access"
ON visitors FOR SELECT
USING (true);

-- Only allow server to insert (via service role key)
CREATE POLICY "Server only insert"
ON visitors FOR INSERT
WITH CHECK (false); -- This blocks anon key inserts
```

#### Example: Public Projects Table

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access"
ON projects FOR SELECT
USING (true);

-- No public writes
CREATE POLICY "No public writes"
ON projects FOR ALL
WITH CHECK (false);
```

### Step 6: Test Your Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Check the console for:
   - ✅ "API Server running on http://localhost:3000"
   - ✅ "GMAIL_USER: SET"
   - ✅ "GMAIL_APP_PASSWORD: SET"
   - ✅ "Supabase service role key: SET" (or warning if not set)

3. Test the visitor tracking:
   - Open your portfolio in a browser
   - Check if visitor tracking works
   - Check if you receive the email notification

### Step 7: Verify Security

Test that your security measures are working:

#### Test API Authentication
```bash
# This should fail (no API key)
curl -X POST http://localhost:3000/api/track-visitor -H "Content-Type: application/json" -d '{"ip":"test"}'

# This should succeed (with correct API key)
curl -X POST http://localhost:3000/api/track-visitor \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"ip":"test"}'
```

#### Test Rate Limiting
Make 100+ requests quickly - you should get a 429 error after the limit.

#### Test Supabase RLS
Try to insert data from the browser console using the anon key - it should fail if RLS is configured correctly.

## 🔒 Security Architecture

### What's Now Secured:

1. **Express Server API** (`/api/track-visitor`)
   - ✅ API key authentication required
   - ✅ Rate limited (100 requests per 15 minutes per IP)
   - ✅ CORS can be restricted to your domain

2. **Supabase Data**
   - ✅ Anon key in frontend has limited permissions (via RLS)
   - ✅ Service role key only in Express server (never exposed)
   - ✅ Sensitive operations route through Express server

3. **Environment Variables**
   - ✅ `.env` file is gitignored
   - ✅ `.env.example` has only placeholders
   - ✅ Production uses separate environment variables

### Still Public (By Design):

- **Supabase anon key** - Designed to be public, secured via RLS
- **VITE_API_KEY** - Exposed in frontend bundle (acceptable for API auth)

## 🚀 Next Steps

1. **Configure RLS policies** for all your Supabase tables
2. **Set up CORS restrictions** in Express server:
   ```javascript
   app.use(cors({
     origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
     credentials: true
   }));
   ```
3. **Enable HTTPS** in production
4. **Add monitoring** for suspicious API activity
5. **Rotate API keys** periodically

## 📝 Notes

- The Express server now has a `supabaseAdmin` client with service role privileges
- Use this for any admin operations from your server code
- Never call Supabase admin operations from the frontend
- Rate limiting is applied to all `/api/*` routes

## 🆘 Troubleshooting

**Problem**: "Missing Supabase environment variables!"
- **Solution**: Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your `.env` file

**Problem**: "Unauthorized: Invalid or missing API key"
- **Solution**: Ensure `API_KEY` and `VITE_API_KEY` are set in `.env` and match

**Problem**: "Too many requests"
- **Solution**: You've hit the rate limit. Wait 15 minutes or adjust the limit in `server.js`

**Problem**: Emails not sending
- **Solution**: Check that `GMAIL_USER` and `GMAIL_APP_PASSWORD` are correct
