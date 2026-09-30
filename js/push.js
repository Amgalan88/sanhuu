// Web Push: service worker бүртгэх, мэдэгдэл асаах/унтраах.
// iPhone-д зөвхөн "Нүүр дэлгэцэнд нэмсэн" апп-аас (iOS 16.4+) ажиллана.
import { VAPID_PUBLIC_KEY } from './config.js';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('service worker', e);
    return null;
  }
}

/** 'on' | 'off' | 'denied' | 'ios-install' | 'unsupported' | 'no-key' */
export async function pushState() {
  if (!VAPID_PUBLIC_KEY) return 'no-key';
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(b64url) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function enablePush(store) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Мэдэгдлийн зөвшөөрөл өгөөгүй байна');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerSW());
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await store.savePushSubscription(sub.toJSON());
}

export async function disablePush(store) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await store.deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}
