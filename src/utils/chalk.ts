export const EnvErrorLoggger = (error: any) =>
	console.error(
		`\n\n\n\x1b[1m\x1b[31m❌ ENVIRONMENT VALIDATION FAILED ❌\x1b[0m\n`,
		error,
		`\n\x1b[1m\x1b[31mPlease set all required environment variables before starting the app.\x1b[0m`,
	);
