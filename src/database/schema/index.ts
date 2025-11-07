export { userRoleEnum, type RoleType } from './_Enums';

export { permissions, permissionsRelations } from './master/permissions';
export { roles, rolesRelations } from './master/roles';

export { rolePermissions, rolePermissionsRelations } from './rolePermissions';
export { userRoles, userRolesRelations } from './userRoles';
export { users, usersRelations, type SelectUserType } from './users';

// Gender Enum
export { genderEnum } from './business/customer/customers';

// Customer schemas
export {
	customerMaster,
	customerMasterRelations,
	type SelectCustomer,
	type InsertCustomer,
} from './business/customer/customers';

export {
	notificationPreferences,
	notificationPreferencesRelations,
	type SelectNotificationPreferences,
	type InsertNotificationPreferences,
} from './business/customer/notificationPreferences';

// Customer Group schemas
export {
	customerGroups,
	customerGroupsRelations,
	type SelectCustomerGroup,
	type InsertCustomerGroup,
} from './business/customerGroup/customerGroups';

export {
	customerGroupMembers,
	customerGroupMembersRelations,
	type SelectCustomerGroupMember,
	type InsertCustomerGroupMember,
} from './business/customerGroup/customerGroupMembers';

// Loyalty schemas
export {
	loyaltyAccounts,
	loyaltyAccountsRelations,
	type SelectLoyaltyAccount,
	type InsertLoyaltyAccount,
} from './business/loyalities/loyaltyAccounts';

export {
	loyaltyTransactions,
	loyaltyTransactionsRelations,
	type SelectLoyaltyTransaction,
	type InsertLoyaltyTransaction,
} from './business/loyalities/loyaltyTransactions';

export {
	tiers,
	tiersRelations,
	type SelectTier,
	type InsertTier,
} from './business/loyalities/tiers';

// Order schemas
export {
	orders,
	ordersRelations,
	orderStatusEnum,
	type SelectOrder,
	type InsertOrder,
} from './business/order/orders';

export {
	orderMapping,
	orderMappingRelations,
	orderMappingStatusEnum,
	type SelectOrderMapping,
	type InsertOrderMapping,
} from './business/order/orderMapping';
