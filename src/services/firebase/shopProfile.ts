import { collection, doc } from 'firebase/firestore';
import { db } from './config';
import type { ShopProfile } from '../../types/app';

const ACTIVE_SHOP_PROFILE_KEY = 'shop-keeper:active-shop-profile';

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  id: 'ultimate-auto-body',
  name: 'Ultimate Auto Body',
};

export function normalizeShopId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_SHOP_PROFILE.id;
}

export function getActiveShopProfile(): ShopProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_SHOP_PROFILE;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVE_SHOP_PROFILE_KEY);
    if (!raw) {
      return DEFAULT_SHOP_PROFILE;
    }

    const parsed = JSON.parse(raw) as Partial<ShopProfile>;
    const id = normalizeShopId(parsed.id || DEFAULT_SHOP_PROFILE.id);
    const name = String(parsed.name || DEFAULT_SHOP_PROFILE.name).trim();

    return {
      id,
      name: name || DEFAULT_SHOP_PROFILE.name,
    };
  } catch (error) {
    console.error('Failed to read active shop profile:', error);
    return DEFAULT_SHOP_PROFILE;
  }
}

export function setActiveShopProfile(profile: ShopProfile) {
  const nextProfile: ShopProfile = {
    id: normalizeShopId(profile.id),
    name: profile.name.trim() || DEFAULT_SHOP_PROFILE.name,
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_SHOP_PROFILE_KEY, JSON.stringify(nextProfile));
  }

  return nextProfile;
}

export function getActiveShopId() {
  return getActiveShopProfile().id;
}

export function getActiveShopName() {
  return getActiveShopProfile().name;
}

export function withActiveShopFields<T extends Record<string, unknown>>(payload: T) {
  const profile = getActiveShopProfile();

  return {
    ...payload,
    shopId: profile.id,
    shopName: profile.name,
  };
}

export function belongsToActiveShop(data: Record<string, unknown>) {
  const shopId = String(data.shopId ?? '').trim();

  // Legacy documents were created before shop profiles existed. They belong to
  // the default shop so the first profile rollout does not hide existing work.
  if (!shopId) {
    return getActiveShopId() === DEFAULT_SHOP_PROFILE.id;
  }

  return normalizeShopId(shopId) === getActiveShopId();
}

export function shopCollection(collectionName: string) {
  return collection(db, 'shops', getActiveShopId(), collectionName);
}

export function shopDoc(collectionName: string, documentId: string) {
  return doc(db, 'shops', getActiveShopId(), collectionName, documentId);
}

export function shopScopedDocumentId(baseId: string) {
  const shopId = getActiveShopId();

  return shopId === DEFAULT_SHOP_PROFILE.id ? baseId : `${shopId}-${baseId}`;
}

export function scopedStoragePath(path: string) {
  return `shops/${getActiveShopId()}/${path.replace(/^\/+/, '')}`;
}
