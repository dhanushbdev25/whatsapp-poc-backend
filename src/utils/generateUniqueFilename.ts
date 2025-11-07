import { v4 as uuidv4 } from 'uuid';

export const generateUniqueFilename = (filename: string): string => {
	const uuid = uuidv4();
	return `${uuid}_${filename}`;
};
