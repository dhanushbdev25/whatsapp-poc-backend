import axios from 'axios';
import jwt from 'jsonwebtoken';
import env from '@/env';
import Hash from '@/lib/hash';

export type MicrosoftGraphUser = {
	'@odata.context': string;
	businessPhones: string[];
	displayName: string;
	givenName: string | null;
	jobTitle: string | null;
	mail: string | null;
	mobilePhone: string | null;
	officeLocation: string | null;
	preferredLanguage: string | null;
	surname: string | null;
	userPrincipalName: string;
	id: string;
};

export async function getUserProfileFromMicrosoft(
	token: string,
): Promise<MicrosoftGraphUser> {
	try {
		console.log('Fetching user profile from Microsoft Graph', token);

		const response = await axios.get(
			'https://graph.microsoft.com/v1.0/me',
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);
		console.log('Microsoft Graph response:', response.data);

		return response.data;
	} catch (error) {
		console.error(
			'Microsoft Graph error:',
			error.response?.data || error.message,
		);
		throw new Error('Failed to fetch user profile from Microsoft Graph');
	}
}

export async function verifyPassword(plain: string, hash: string) {
	return Hash.compareHash(plain, hash);
}

export function issueTokens(
	user: { id: string; name: string; email: string },
	roleId: number,
) {
	const accessToken = jwt.sign(
		{
			userId: user.id,
			name: user.name,
			email: user.email,
			roleId: roleId,
		},

		env.JWT_SECRET,
		{ expiresIn: '30m' },
	);

	const refreshToken = jwt.sign({ userId: user.id }, env.JWT_REFRESH_SECRET, {
		expiresIn: '7d',
	});

	return { accessToken, refreshToken };
}
