/**
 * Merony Hair.NG – API client
 * Progressive replacement for localStorage-only data access.
 */
const API_BASE = "/api";

function getToken() {
  try {
    const admin = JSON.parse(localStorage.getItem("merony_admin_session") || "null");
    if (admin?.token) return admin.token;
    const user = JSON.parse(localStorage.getItem("merony_user") || "null");
    if (user?.token) return user.token;
  } catch {}
  return null;
}

function getSessionId() {
  let sid = localStorage.getItem("merony_session_id");
  if (!sid) {
    sid = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("merony_session_id", sid);
  }
  return sid;
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Session-Id": getSessionId(),
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Request failed");
    err.status = res.status;
    err.code = data.code;
    err.errors = data.errors;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  products: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/products${q ? "?" + q : ""}`);
    },
    get: (slugOrId) => request(`/products/${slugOrId}`),
  },
  cart: {
    get: () => request("/cart"),
    add: (variantId, quantity = 1) =>
      request("/cart/items", { method: "POST", body: { variantId, quantity } }),
    update: (variantId, quantity) =>
      request(`/cart/items/${variantId}`, { method: "PATCH", body: { quantity } }),
    remove: (variantId) =>
      request(`/cart/items/${variantId}`, { method: "DELETE" }),
    merge: () => request("/cart/merge", { method: "POST" }),
  },
  orders: {
    create: (payload) => request("/orders", { method: "POST", body: payload }),
    get: (idOrNumber) => request(`/orders/${idOrNumber}`),
  },
  coupons: {
    validate: (code, subtotal) =>
      request("/coupons/validate", { method: "POST", body: { code, subtotal } }),
  },
  shipping: {
    list: () => request("/shipping"),
  },
  contact: {
    send: (payload) => request("/contact", { method: "POST", body: payload }),
  },
  auth: {
    register: (payload) => request("/auth/register", { method: "POST", body: payload }),
    login: (payload) => request("/auth/login", { method: "POST", body: payload }),
    adminLogin: (payload) =>
      request("/auth/admin/login", { method: "POST", body: payload }),
  },
  wishlist: {
    list: () => request("/wishlist"),
    add: (productId, variantId) =>
      request("/wishlist/items", { method: "POST", body: { productId, variantId } }),
    remove: (productId) =>
      request(`/wishlist/items/${productId}`, { method: "DELETE" }),
  },
  admin: {
    dashboard: () => request("/admin/dashboard"),
    analytics: () => request("/admin/analytics"),
    products: () => request("/admin/products"),
    orders: () => request("/admin/orders"),
    customers: () => request("/admin/customers"),
    inventory: () => request("/admin/inventory"),
    messages: () => request("/admin/messages"),
    coupons: () => request("/admin/coupons"),
  },
};

// Attach for non-module scripts
if (typeof window !== "undefined") {
  window.MeronyAPI = api;
}
