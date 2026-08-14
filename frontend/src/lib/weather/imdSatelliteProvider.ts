import type { SatelliteProduct, SatelliteProductConfig } from "./imdSatelliteTypes";
import { SATELLITE_PRODUCTS as _SATELLITE_PRODUCTS } from "./imdSatelliteTypes";

export const SATELLITE_PRODUCTS = _SATELLITE_PRODUCTS;
export type { SatelliteProduct, SatelliteProductConfig } from "./imdSatelliteTypes";

export const IMD_SATELLITE_PROXY_ROUTE = "/api/weather/imd-satellite";

export function getSatelliteProductConfig(product: SatelliteProduct): SatelliteProductConfig {
  const config = _SATELLITE_PRODUCTS[product];
  if (!config) throw new Error(`Unknown satellite product "${product}"`);
  return config;
}

export function getSatelliteBounds(product: SatelliteProduct): [number, number, number, number] {
  return getSatelliteProductConfig(product).bounds;
}

export function buildSatelliteProxyUrl(
  product: SatelliteProduct,
  frameIndex: number,
  cacheBust?: number
): string {
  const params = new URLSearchParams({
    product,
    frame: String(frameIndex),
  });
  if (cacheBust) params.set("t", String(cacheBust));
  return `${IMD_SATELLITE_PROXY_ROUTE}/frame?${params.toString()}`;
}

export function buildSatelliteManifestUrl(cacheBust?: number): string {
  const params = new URLSearchParams();
  if (cacheBust) params.set("t", String(cacheBust));
  const qs = params.toString();
  return `${IMD_SATELLITE_PROXY_ROUTE}/manifest${qs ? `?${qs}` : ""}`;
}

export function getSatelliteImageCoordinates(
  product: SatelliteProduct
): [[number, number], [number, number], [number, number], [number, number]] {
  const bounds = getSatelliteBounds(product);
  return [
    [bounds[0], bounds[3]], // top-left (west, north)
    [bounds[2], bounds[3]], // top-right (east, north)
    [bounds[2], bounds[1]], // bottom-right (east, south)
    [bounds[0], bounds[1]], // bottom-left (west, south)
  ];
}
