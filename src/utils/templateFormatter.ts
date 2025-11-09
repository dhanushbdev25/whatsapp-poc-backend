/**
 * Format a Facebook Graph API template object into a frontend-friendly structure
 */
export function formatTemplateResponse(template: any) {
	if (!template || !Array.isArray(template.components)) return null;

	const { name, language, category, status } = template;

	const bodyComponent = template.components.find(
		(c: any) => c.type?.toUpperCase() === 'BODY',
	);
	const headerComponent = template.components.find(
		(c: any) => c.type?.toUpperCase() === 'HEADER',
	);

	const formatted: any = {
		label: name,
		value: name,
		data: {
			body: bodyComponent?.text || '',
			language: language || '',
			category: category || '',
			status: status || '',
		},
	};

	if (headerComponent?.format?.toUpperCase() === 'IMAGE') {
		const imageUrl = headerComponent.example?.header_handle?.[0];
		if (imageUrl) formatted.data.image = imageUrl;
	}

	return formatted;
}
