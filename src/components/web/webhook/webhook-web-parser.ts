import { z } from 'zod/v4';

const Zerror = (issue: any, name: string, type: string) =>
	issue?.input === undefined
		? `${name} is required`
		: `${name} must be a ${type}`;

export const WebhookVerificationQueryParser = z.object({
	'hub.mode': z.string({
		error: (issue) => Zerror(issue, 'hub.mode', 'string'),
	}),
	'hub.verify_token': z.string({
		error: (issue) => Zerror(issue, 'hub.verify_token', 'string'),
	}),
	'hub.challenge': z.string({
		error: (issue) => Zerror(issue, 'hub.challenge', 'string'),
	}),
}).loose();

