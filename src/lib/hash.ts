import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export default class Hash {
	private static readonly saltRounds = 10;

	// Async bcrypt hash
	public static async hash(plainText: string): Promise<string> {
		const salt = await bcrypt.genSalt(this.saltRounds);
		return bcrypt.hash(plainText, salt);
	}

	// Async SHA256 hash
	public static async tokenHash(plainText: string): Promise<string> {
		return new Promise((resolve, reject) => {
			try {
				const hash = crypto
					.createHash('sha256')
					.update(plainText)
					.digest('hex');
				resolve(hash);
			} catch (err) {
				reject(err as Error);
			}
		});
	}

	// Async bcrypt compare
	public static async compareHash(
		plainText: string,
		existingHash: string,
	): Promise<boolean> {
		return bcrypt.compare(plainText, existingHash);
	}
}
