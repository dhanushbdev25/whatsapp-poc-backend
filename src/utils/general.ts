export const getUniqueId = () =>
	`UI${new Date().getTime()}${Math.floor(10 + Math.random() * 99)}`;

export const generateOtp = (length: number = 6) => {
	const digits = '0123456789';
	let otp = '';

	for (let i = 0; i < length; i++) {
		otp += digits[Math.floor(Math.random() * digits.length)];
	}

	return otp;
};

export const normalizeString = (name: string) => {
	if (!name) return name;
	// lowercase, trim extra spaces, and PascalCase (Title Case)
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ') // replace multiple spaces with single space
		.split(' ')
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
};

export function formatUptime(seconds: number) {
	const mins = Math.floor(seconds / 60);
	const hrs = Math.floor(mins / 60);
	if (hrs > 0) return `${hrs}h ${mins % 60}m ${Math.floor(seconds % 60)}s`;
	if (mins > 0) return `${mins}m ${Math.floor(seconds % 60)}s`;
	return `${Math.floor(seconds)}s`;
}
