// src/utils/excelCustomers.ts
import ExcelJS from 'exceljs';

export const TEMPLATE_HEADERS = [
	'customerID', // 👈 Added customerID column
	'name',
	'email',
	'phone',
	'gender',
	'address',
	'state',
	'pincode',
	'orderUpdates',
	'loyaltyRewards',
	'promotionalMessages',
] as const;

export async function buildCustomersTemplate(): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Customers');

	// Add header row
	ws.addRow(TEMPLATE_HEADERS);

	// Add a few example rows
	ws.addRow([
		'919876543210',
		'Alex Doe',
		'alex@example.com',
		'9876543210',
		'male',
		'221 Baker St',
		'KA',
		'560001',
		true,
		false,
		true,
		new Date(),
	]);
	ws.addRow([
		'919123456780',
		'Priya S',
		'priya@example.com',
		'9123456780',
		'female',
		'MG Road',
		'MH',
		'400001',
		false,
		true,
		false,
	]);

	// Make header bold
	ws.getRow(1).font = { bold: true };

	// Auto-adjust column width
	TEMPLATE_HEADERS.forEach((_, idx) => {
		const col = ws.getColumn(idx + 1);
		let max = 10;
		col.eachCell((cell) => {
			const len = (cell.value?.toString() || '').length;
			if (len > max) max = len + 2;
		});
		col.width = max;
	});

	const buf = await wb.xlsx.writeBuffer();
	return Buffer.from(buf);
}

function toBool(value: any): boolean {
	if (typeof value === 'boolean') return value;
	if (value == null) return false;
	const s = String(value).toLowerCase().trim();
	return ['true', '1', 'yes', 'y'].includes(s);
}

/**
 * Parse uploaded Excel file into an array of customers
 */
export async function parseCustomersExcel(buffer) {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(buffer);
	const ws = wb.worksheets[0];

	if (!ws) throw new Error('No worksheet found');

	const customers: any[] = [];

	ws.eachRow((row, index) => {
		if (index === 1) return; // skip header
		console.log(row);
		const [
			customerID,
			name,
			email,
			phone,
			gender,
			address,
			state,
			pincode,
			orderUpdates,
			loyaltyRewards,
			promotionalMessages,
		] = TEMPLATE_HEADERS.map((_, i) => row.getCell(i + 1).value);

		console.log('Consoledddd', [customerID, Number(customerID)]);
		if (!name || !email) return; // skip empty rows

		customers.push({
			// 👇 Safe handling of customerID
			customerID: customerID ? Number(customerID) : undefined,
			name: String(name).trim(),
			email: String(email).trim(),
			phone: phone ? String(phone).trim() : null,
			gender: gender ? String(gender).trim().toLowerCase() : null,
			address: address ? String(address).trim() : null,
			state: state ? String(state).trim() : null,
			pincode: pincode ? String(pincode).trim() : null,
			notificationPreferences: {
				orderUpdates: toBool(orderUpdates),
				loyaltyRewards: toBool(loyaltyRewards),
				promotionalMessages: toBool(promotionalMessages),
			},
		});
	});

	return customers;
}
