import logger from '@/lib/logger';

/**
 * Parse WhatsApp ID (wa_id) to bigint customer ID
 * wa_id is typically a string like "91XXXXXXXXXX", we need to convert it to number (bigint)
 *
 * @param waId - WhatsApp ID string (e.g., "91XXXXXXXXXX")
 * @returns Customer ID as number (bigint)
 * @throws Error if wa_id format is invalid
 */
export function parseWaIdToCustomerID(waId: string): number {
	try {
		// Remove any non-numeric characters and parse to number
		const numericId = waId.replace(/\D/g, '');
		const customerID = parseInt(numericId, 10);

		if (isNaN(customerID) || customerID <= 0) {
			throw new Error(`Invalid wa_id format: ${waId}`);
		}

		return customerID;
	} catch (error) {
		logger.error('Failed to parse wa_id to customerID', { error, waId });
		throw error;
	}
}

/**
 * Helper function to find field by multiple possible names
 * Handles both standard format and nfm_reply format (like screen_0_First_Name_0)
 *
 * @param flowResponse - Flow response data object
 * @param searchTerms - Array of possible field names to search for
 * @returns Field value if found, undefined otherwise
 */
export function getFlowField(
	flowResponse: any,
	...searchTerms: string[]
): string | undefined {
	if (!flowResponse) return undefined;

	// First try exact matches
	for (const term of searchTerms) {
		if (flowResponse[term]) {
			return flowResponse[term];
		}
	}

	// Then try case-insensitive partial matches (for nfm_reply format)
	const lowerTerms = searchTerms.map((t) =>
		t.toLowerCase().replace(/_/g, ''),
	);
	for (const key in flowResponse) {
		const lowerKey = key.toLowerCase().replace(/_/g, '');
		if (lowerTerms.some((term) => lowerKey.includes(term))) {
			return flowResponse[key];
		}
	}

	return undefined;
}
