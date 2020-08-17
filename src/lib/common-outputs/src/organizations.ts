export interface OrganizationalUnit {
  ouId: string;
  ouArn: string;
  ouName: string;
  ouPath: string;
}
export function getOrganizationalUnitIdByPath(organizations: OrganizationalUnit[], ouPath: string): string | undefined {
  const organizationalUnit = organizations.find(ou => ou.ouPath === ouPath);
  if (!organizationalUnit) {
    console.warn(`Cannot find OrganizationUnit with Path "${ouPath}"`);
    return;
  }
  return organizationalUnit.ouId;
}
