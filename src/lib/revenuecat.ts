/**
 * RevenueCat Server-Side API Helper
 *
 * Uses the RevenueCat REST API to verify subscription status server-side.
 * This ensures users can't bypass subscription checks by manipulating the client.
 */

const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;
const REVENUECAT_API_URL = 'https://api.revenuecat.com/v1';

type RevenueCatEntitlement = {
  expires_date: string | null;
  purchase_date: string;
  product_identifier: string;
};

type RevenueCatSubscriberResponse = {
  subscriber: {
    entitlements: {
      [key: string]: RevenueCatEntitlement;
    };
    subscriptions: {
      [key: string]: {
        expires_date: string | null;
        purchase_date: string;
        unsubscribe_detected_at: string | null;
        billing_issues_detected_at: string | null;
      };
    };
  };
};

/**
 * Check if RevenueCat is configured on the backend
 */
export const isRevenueCatConfigured = (): boolean => {
  return !!REVENUECAT_API_KEY;
};

/**
 * Get subscriber info from RevenueCat with timeout
 * Uses device ID as the app_user_id since that's what the mobile app uses
 */
export const getSubscriberInfo = async (
  deviceId: string
): Promise<RevenueCatSubscriberResponse | null> => {
  if (!REVENUECAT_API_KEY) {
    console.log('[RevenueCat] API key not configured, skipping subscription check');
    return null;
  }

  try {
    // Add timeout to prevent blocking - 3 seconds max
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    console.log(`[RevenueCat] Fetching subscriber info for: ${deviceId}`);

    const response = await fetch(
      `${REVENUECAT_API_URL}/subscribers/${encodeURIComponent(deviceId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 404 means subscriber doesn't exist (never purchased)
      if (response.status === 404) {
        console.log(`[RevenueCat] Subscriber not found for: ${deviceId}`);
        return null;
      }
      const errorText = await response.text();
      console.error('[RevenueCat] API error:', response.status, errorText);
      return null;
    }

    const data = await response.json() as RevenueCatSubscriberResponse;
    console.log(`[RevenueCat] Subscriber data for ${deviceId}:`, JSON.stringify(data.subscriber.entitlements));
    return data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.log('[RevenueCat] Request timed out, skipping verification');
    } else {
      console.error('[RevenueCat] Failed to fetch subscriber info:', error);
    }
    return null;
  }
};

/**
 * Check if a device has an active premium entitlement
 * Returns true if the user has an active, non-expired premium subscription
 */
export const hasActivePremium = async (deviceId: string): Promise<boolean> => {
  const subscriberInfo = await getSubscriberInfo(deviceId);

  if (!subscriberInfo) {
    return false;
  }

  const premiumEntitlement = subscriberInfo.subscriber.entitlements['premium'];

  if (!premiumEntitlement) {
    return false;
  }

  // Check if entitlement has expired
  if (premiumEntitlement.expires_date) {
    const expiresDate = new Date(premiumEntitlement.expires_date);
    const now = new Date();

    if (expiresDate < now) {
      console.log(`[RevenueCat] Premium expired for device ${deviceId} at ${premiumEntitlement.expires_date}`);
      return false;
    }
  }

  return true;
};
