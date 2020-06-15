export interface Organization {
    key: string;
    id: string;
    name: string;
  }
  
  export function getOrganizationId(organizations: Organization[], ouName: string): string | undefined {
    const organization = organizations.find(a => a.name === ouName);
    if (!organization) {
      console.warn(`Cannot find Organization with key "${ouName}"`);
      return;
    }
    return organization.id;
  }