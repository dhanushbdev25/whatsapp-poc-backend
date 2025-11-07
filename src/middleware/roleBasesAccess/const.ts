// Module permissions - customize based on your application needs
export const ModuleEnum = Object.freeze({
	// Example modules - replace with your actual module names
	VIEW_DASHBOARD: 'viewdashboard',
	MANAGE_USERS: 'manageusers',
	VIEW_REPORTS: 'viewreports',
	ADMIN_SETTINGS: 'adminsettings',
} as const);

export type ModuleEnumType = (typeof ModuleEnum)[keyof typeof ModuleEnum];
