"use client";

const CUSTOMER_KEY = "verita_customer_api_key";
const OPS_KEY = "verita_ops_api_key";

export function getCustomerApiKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(CUSTOMER_KEY) ?? "";
}

export function setCustomerApiKey(value: string) {
  window.sessionStorage.setItem(CUSTOMER_KEY, value);
}

export function getOpsApiKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(OPS_KEY) ?? "";
}

export function setOpsApiKey(value: string) {
  window.sessionStorage.setItem(OPS_KEY, value);
}
