import { useEffect, useRef, useState } from "react"
import { Loader } from "@googlemaps/js-api-loader"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import {
  getDeliveryAddressMode,
  notifyUserLocationChanged,
  persistUserLocation,
  setDeliveryAddressMode,
} from "@food/utils/deliveryLocationUtils"

/**
 * Typing a delivery location instead of sharing GPS: Google Places
 * suggestions (India), then the picked place becomes the delivery location
 * the same way choosing a saved address does.
 */
let placesReady = null

function loadPlaces() {
  if (window.google?.maps?.places) return Promise.resolve(true)
  if (!placesReady) {
    placesReady = getGoogleMapsApiKey()
      .then((apiKey) => {
        if (!apiKey) return false
        return new Loader({ apiKey, version: "weekly", libraries: ["places"] }).load().then(() => Boolean(window.google?.maps?.places))
      })
      .catch(() => {
        placesReady = null
        return false
      })
  }
  return placesReady
}

/** Place suggestions for `query` (3+ characters), debounced. */
export function usePlaceSuggestions(query) {
  const [state, setState] = useState({ items: [], loading: false })
  const service = useRef(null)
  const token = useRef(null)

  useEffect(() => {
    const q = String(query || "").replace(/\s+/g, " ").trim()
    if (q.length < 3) {
      setState({ items: [], loading: false })
      return undefined
    }
    let live = true
    setState((s) => ({ ...s, loading: true }))
    const t = setTimeout(async () => {
      let items = []
      if (await loadPlaces()) {
        const places = window.google.maps.places
        service.current ||= new places.AutocompleteService()
        token.current ||= new places.AutocompleteSessionToken()
        items = await new Promise((resolve) =>
          service.current.getPlacePredictions(
            { input: q, componentRestrictions: { country: "in" }, sessionToken: token.current },
            (list, status) =>
              resolve(
                status === places.PlacesServiceStatus.OK && Array.isArray(list)
                  ? list.slice(0, 6).map((p) => ({
                      id: p.place_id,
                      placeId: p.place_id,
                      main: p.structured_formatting?.main_text || p.description || "",
                      secondary: p.structured_formatting?.secondary_text || "",
                      description: p.description || "",
                    }))
                  : [],
              ),
          ),
        )
      }
      // Google unavailable or empty: OpenStreetMap, so typing a place always works.
      if (!items.length) items = await searchOpenStreetMap(q)
      if (live) setState({ items, loading: false })
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query])

  return state
}

async function searchOpenStreetMap(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    )
    const json = await res.json()
    return (Array.isArray(json) ? json : [])
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => {
        const a = r.address || {}
        const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.town || r.name || ""
        const city = a.city || a.town || a.county || a.state_district || ""
        return {
          id: `osm-${r.place_id}`,
          main: r.name || area || String(r.display_name || "").split(",")[0],
          secondary: [area !== r.name ? area : "", city, a.state].filter(Boolean).join(", "),
          description: r.display_name || "",
          // Coordinates come with the result; no details lookup needed.
          resolved: {
            latitude: Number(r.lat),
            longitude: Number(r.lon),
            area: area || city,
            city,
            state: a.state || "",
            pincode: a.postcode || "",
            address: r.name || area,
            formattedAddress: r.display_name || "",
          },
        }
      })
  } catch {
    return []
  }
}

const component = (components, type) => components.find((c) => c.types?.includes(type))?.long_name || ""

/** Coordinates and address parts for a suggestion. */
export async function resolvePlace(suggestion) {
  if (suggestion.resolved) return suggestion.resolved
  const ok = await loadPlaces()
  if (!ok) throw new Error("Location search is unavailable right now.")
  const svc = new window.google.maps.places.PlacesService(document.createElement("div"))
  const place = await new Promise((resolve, reject) => {
    svc.getDetails(
      { placeId: suggestion.placeId, fields: ["geometry", "address_components", "formatted_address", "name"] },
      (res, status) =>
        status === window.google.maps.places.PlacesServiceStatus.OK && res?.geometry?.location
          ? resolve(res)
          : reject(new Error("Couldn't find that place. Try another.")),
    )
  })
  const comps = place.address_components || []
  const area =
    component(comps, "sublocality_level_1") || component(comps, "sublocality") || component(comps, "neighborhood") || suggestion.main
  const city = component(comps, "locality") || component(comps, "administrative_area_level_2")
  return {
    latitude: place.geometry.location.lat(),
    longitude: place.geometry.location.lng(),
    area,
    city,
    state: component(comps, "administrative_area_level_1"),
    pincode: component(comps, "postal_code"),
    address: suggestion.main || place.name || area,
    formattedAddress: place.formatted_address || suggestion.description,
  }
}

/**
 * Make a typed location the delivery location. With a saved default address
 * the "saved" mode would keep using that address, so the typed one goes in as
 * the current location instead.
 */
export function applyDeliveryLocation(loc, { hasSavedDefault = false } = {}) {
  persistUserLocation(loc)
  const wanted = hasSavedDefault ? "current" : "saved"
  if (getDeliveryAddressMode() !== wanted) setDeliveryAddressMode(wanted)
  notifyUserLocationChanged(loc)
}

/** Why GPS failed, in words a customer can act on. */
export async function gpsFailureMessage(err) {
  let state = null
  try {
    state = (await navigator.permissions?.query({ name: "geolocation" }))?.state || null
  } catch {
    // Permissions API missing: fall through to the error code.
  }
  if (!navigator.geolocation) return "This browser can't share your location. Type your area instead."
  if (state === "denied" || err?.code === 1) {
    return "Location access is blocked for Craviox. Allow it from the lock icon in the address bar, or type your area instead."
  }
  if (err?.code === 3) return "Finding your location took too long. Try again, or type your area instead."
  return "Couldn't detect your location. Type your area instead."
}
