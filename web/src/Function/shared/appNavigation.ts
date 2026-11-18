import type { NavigationState } from '@/types/navigation';

// "Open this screen" from anywhere: a page deep in a view (an Element, an
// Object) asks the shell to switch the active tab's view and route, without
// every view being handed the shell's setters. page.tsx listens.

export const OPEN_IN_APP_EVENT = 'clayware:open-in-app';

export interface OpenInAppDetail {
  /** A view id (viewRegistry), e.g. 'note' or 'slides'. */
  view: string;
  nav?: Partial<NavigationState>;
}

export function openInApp(view: string, nav?: Partial<NavigationState>): void {
  window.dispatchEvent(new CustomEvent<OpenInAppDetail>(OPEN_IN_APP_EVENT, { detail: { view, nav } }));
}

// "Open this Domain's settings" from its own page's "…": the settings dialog
// belongs to the sidebar (AppSidebar listens), as it does from the sidebar row.
export const OPEN_DOMAIN_SETTINGS_EVENT = 'clayware:open-domain-settings';

export function openDomainSettings(domainId: string): void {
  window.dispatchEvent(new CustomEvent<{ domainId: string }>(OPEN_DOMAIN_SETTINGS_EVENT, { detail: { domainId } }));
}
