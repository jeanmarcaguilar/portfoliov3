import { UAParser } from 'ua-parser-js';

interface VisitorData {
  ip: string;
  location: {
    city?: string;
    country?: string;
    region?: string;
    latitude?: number;
    longitude?: number;
  };
  device: {
    type?: string;
    model?: string;
    vendor?: string;
  };
  os: {
    name?: string;
    version?: string;
  };
  browser: {
    name?: string;
    version?: string;
  };
  screenResolution: string;
  timestamp: string;
  userAgent: string;
}

/**
 * Get visitor IP address using ipify API
 */
async function getIPAddress(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error getting IP address:', error);
    return 'Unknown';
  }
}

/**
 * Get approximate location using ip-api.com
 */
async function getLocation(ip: string): Promise<VisitorData['location']> {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        city: data.city,
        country: data.country,
        region: data.regionName,
        latitude: data.lat,
        longitude: data.lon,
      };
    }
    return {};
  } catch (error) {
    console.error('Error getting location:', error);
    return {};
  }
}

/**
 * Get device information using UA Parser
 */
function getDeviceInfo(): {
  device: VisitorData['device'];
  os: VisitorData['os'];
  browser: VisitorData['browser'];
  userAgent: string;
} {
  const parser = new UAParser();
  const result = parser.getResult();

  return {
    device: {
      type: result.device.type,
      model: result.device.model,
      vendor: result.device.vendor,
    },
    os: {
      name: result.os.name,
      version: result.os.version,
    },
    browser: {
      name: result.browser.name,
      version: result.browser.version,
    },
    userAgent: navigator.userAgent,
  };
}

/**
 * Get screen resolution
 */
function getScreenResolution(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

/**
 * Collect all visitor data
 */
export async function collectVisitorData(): Promise<VisitorData> {
  const ip = await getIPAddress();
  const location = await getLocation(ip);
  const deviceInfo = getDeviceInfo();
  const screenResolution = getScreenResolution();
  const timestamp = new Date().toISOString();

  return {
    ip,
    location,
    device: deviceInfo.device,
    os: deviceInfo.os,
    browser: deviceInfo.browser,
    screenResolution,
    timestamp,
    userAgent: deviceInfo.userAgent,
  };
}

/**
 * Send visitor data to tracking API
 */
export async function trackVisitor(): Promise<void> {
  try {
    // Check if this visitor has already been tracked in this session
    const sessionKey = 'visitor_tracked';
    if (sessionStorage.getItem(sessionKey)) {
      console.log('Visitor already tracked in this session - skipping');
      return;
    }

    console.log('Starting visitor tracking...');
    const visitorData = await collectVisitorData();
    console.log('Collected visitor data:', visitorData);

    // Send to API endpoint (works in both dev and production)
    console.log('Sending to API endpoint: /api/track-visitor');

    // In development, use the API server directly
    // In production, use the relative path (Vercel will handle it)
    const apiUrl = import.meta.env.DEV
      ? 'http://localhost:3000/api/track-visitor'
      : '/api/track-visitor';

    console.log('Request URL:', apiUrl);
    console.log('Environment:', import.meta.env.DEV ? 'development' : 'production');

    let response;
    let responseData;

    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(visitorData),
      });

      console.log('API response status:', response.status);
      console.log('API response ok:', response.ok);

      responseData = await response.json();
      console.log('API response data:', responseData);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      throw fetchError;
    }

    if (response.ok) {
      console.log('Visitor tracked successfully');
      sessionStorage.setItem(sessionKey, 'true');
    } else {
      console.error('Failed to track visitor:', responseData);
    }
  } catch (error) {
    console.error('Error tracking visitor:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error message:', errorMessage);
  }
}