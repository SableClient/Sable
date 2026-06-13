// oxlint-disable no-console
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Header,
  Box,
  Text,
  IconButton,
  Button,
  Input,
  Chip,
} from 'folds';
import { ClipboardIcon, MapPinAreaIcon, MapPinLineIcon } from '@phosphor-icons/react';
import { chipIcon, composerIcon, Warning, X } from '$components/icons/phosphor';
import { stopPropagation } from '$utils/keyboard';
import type { IContent, MatrixClient, Room } from 'matrix-js-sdk';
import * as css from './LocationDialog.css';
import type { IReplyDraft } from '$state/room/roomInputDrafts';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState, type ChangeEventHandler } from 'react';
import type { LatLngLiteral } from 'leaflet';
import L from 'leaflet';
import { getReplyContent } from '../RoomInput';
import type { RoomMessageEventContent } from '$types/matrix-sdk';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import classNames from 'classnames';

export function filterLocationString(result: string) {
  // OSM format
  if (result.toLowerCase().includes('lat=') && result.toLowerCase().includes('lon=')) {
    const tokenizedResult = result.toLowerCase().split(/[ ,&?;::m]/);
    const coords: { mlat?: string; mlng?: string } = {
      mlat: tokenizedResult.find((item) => item.includes('lat='))?.substring(4),
      mlng: tokenizedResult.find((item) => item.includes('lon='))?.substring(4),
    };
    if (coords.mlat && coords.mlng) {
      const mlat = Number.parseFloat(coords.mlat);
      const mlng = Number.parseFloat(coords.mlng);

      if (!Number.isNaN(mlat) && !Number.isNaN(mlng)) {
        return { status: LocationErrors.none, lat: mlat, lon: mlng } as LocationPoint;
      }
    }
  }
  // Fallback the center of the map on OSM
  if (result.toLowerCase().includes('#map=')) {
    const coords: string[] = result
      .substring(result.toLowerCase().indexOf('#map=') + 5)
      .split(/[, /]/);
    if (coords.length >= 3 && typeof coords[1] === 'string' && typeof coords[2] === 'string') {
      const mlat = Number.parseFloat(coords[1]);
      const mlng = Number.parseFloat(coords[2]);

      if (!Number.isNaN(mlat) && !Number.isNaN(mlng))
        return { status: LocationErrors.none, lat: mlat, lon: mlng } as LocationPoint;
    }
  }
  // apple address bar pins (eg. https://maps.apple.com/place?auid=6096426607790210541&address=Catal%C3%A3o+-+GO%2C+75714-000%2C+Brazil&coordinate=-17.711014%2C-47.488393&name=75714-000&lsp=7618 )
  if (result.toLowerCase().includes('&coordinate=')) {
    const coords: string[] = result
      .substring(result.toLowerCase().indexOf('&coordinate='))
      .replaceAll(/[=& ]|(%2C)/g, ' ')
      .trim()
      .split(' ')
      .filter((item) => item.length > 0);
    if (coords.length >= 3 && typeof coords[1] === 'string' && typeof coords[2] === 'string') {
      const mlat = Number.parseFloat(coords[1]);
      const mlng = Number.parseFloat(coords[2]);

      if (!Number.isNaN(mlat) && !Number.isNaN(mlng)) {
        return { status: LocationErrors.none, lat: mlat, lon: mlng } as LocationPoint;
      }
    }
  }
  // geo tags or just putting the numbers without any formatting next to the other
  const coords = result.split(/[, ;:]/).filter((item) => item.length && item !== 'geo');
  if (coords.length >= 2 && typeof coords[0] === 'string' && typeof coords[1] === 'string') {
    const mlat = Number.parseFloat(coords[0]);
    const mlng = Number.parseFloat(coords[1]);
    if (!Number.isNaN(mlat) && !Number.isNaN(mlng))
      return { status: LocationErrors.none, lat: mlat, lon: mlng } as LocationPoint;
  }
  return { status: LocationErrors.clipboard };
}

type LocationDialogProps = {
  onCancel: () => void;
  mx: MatrixClient;
  room: Room;
  replyDraft?: IReplyDraft;
  clearReplyDraft?: () => void;
};

export enum LocationErrors {
  none,
  permissions = 'You have denied Sable access to you location services',
  module = 'Your device does not have a gps module, or it may not be turned on',
  unknown = 'The sharing failed for unknown reasons',
  clipboard = 'Unable to identify the coordinates from clipboard',
  missingClipboard = 'Unable to retrieve clipboard contents',
}

export type LocationPoint = {
  status: LocationErrors;
  lat?: number;
  lon?: number;
};

export function LocationDialog({
  onCancel,
  mx,
  room,
  replyDraft,
  clearReplyDraft,
}: LocationDialogProps) {
  const [showInteractiveMap] = useSetting(settingsAtom, 'showInteractiveMap');
  const [showEncInteractiveMap] = useSetting(settingsAtom, 'showEncInteractiveMap');
  const showMaps = room.hasEncryptionStateEvent() ? showEncInteractiveMap : showInteractiveMap;

  const initCoords = { lat: 43.959971, lng: -59.790623 };
  const [inputPosition, setInputPosition] = useState<{ lat: string; lng: string }>({
    lat: initCoords.lat.toPrecision(6),
    lng: initCoords.lng.toPrecision(6),
  });
  const [pinPosition, setPinPosition] = useState<L.LatLngLiteral>(initCoords);
  const zoom = useRef<number>(2);
  const [locationError, setLocationError] = useState<LocationErrors>(LocationErrors.none);

  const [map, setMap] = useState<L.Map | null>(null);

  const onMove = useCallback(() => {
    if (map?.getCenter() && map?.getZoom()) {
      zoom.current = map?.getZoom();
    }
  }, [map]);

  useEffect(() => {
    map?.on('move', onMove);
    return () => {
      map?.off('move', onMove);
    };
  }, [map, onMove]);
  const movePin = useCallback(
    (pos: LatLngLiteral) => {
      if (!map) return;
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
      L.marker(pos).addTo(map);
      map.panTo(pos);
    },
    [map]
  );
  const MapEvents = () => {
    useMapEvents({
      click(e) {
        // setPinPosition(e.latlng);
        if (map) {
          movePin(e.latlng);
          setInputPosition({ lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) });
          setPinPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      },
    });
    return false;
  };

  function storeLocation(coords: LocationPoint) {
    setLocationError(coords.status);
    if (!coords.lat || !coords.lon || coords.status !== LocationErrors.none) return;
    movePin({ lat: coords.lat, lng: coords.lon });
    setInputPosition({ lat: coords.lat.toFixed(6), lng: coords.lon.toFixed(6) });
    setPinPosition({ lat: coords.lat, lng: coords.lon });
    return;
  }

  function getClipboard() {
    navigator.clipboard
      .readText()
      .then((result: string) => {
        const coords = filterLocationString(result);
        storeLocation(coords);
      })
      .catch(() => storeLocation({ status: LocationErrors.missingClipboard }));
  }

  function getLocation() {
    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    };
    function success(pos: GeolocationPosition) {
      const crd = pos.coords;

      if (!crd.latitude || !crd.longitude) {
        setLocationError(LocationErrors.unknown);
        return;
      }
      storeLocation({ lat: crd.latitude, lon: crd.longitude, status: LocationErrors.none });
    }

    function error(err: GeolocationPositionError) {
      if (err.code === 1) setLocationError(LocationErrors.permissions);
      else if (err.code === 2) setLocationError(LocationErrors.module);
      else setLocationError(LocationErrors.unknown);
    }
    navigator.geolocation.getCurrentPosition(success, error, options);
  }
  const handleLat: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    const parsed = Number.parseFloat(val);
    setInputPosition({ lat: val, lng: inputPosition.lng });
    if (!Number.isNaN(parsed) && parsed >= -90 && parsed <= 90) {
      movePin({ lat: parsed, lng: pinPosition.lng });
      setPinPosition({ lat: parsed, lng: pinPosition.lng });
    }
  };

  const handleLng: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const val = evt.target.value;
    const parsed = Number.parseFloat(val);
    setInputPosition({ lat: inputPosition.lat, lng: val });
    if (!Number.isNaN(parsed) && parsed >= -180 && parsed <= 180) {
      movePin({ lat: pinPosition.lat, lng: parsed });
      setPinPosition({ lat: pinPosition.lat, lng: parsed });
    }
  };

  const handleSubmit = () => {
    const mlat = pinPosition.lat.toFixed(6);
    const mlon = pinPosition.lng.toFixed(6);
    const content: IContent = {
      msgtype: 'm.location',
      geo_uri: `geo:${mlat},${mlon};u=0`,
      body: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}"`,
    };
    if (replyDraft && clearReplyDraft) {
      content['m.relates_to'] = getReplyContent(replyDraft, room);
      clearReplyDraft();
    }
    mx.sendMessage(room.roomId, content as RoomMessageEventContent).then(() => {
      onCancel();
    });
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" className={css.LocationDialogBody}>
            <Header className={css.LocationDialogHeader} variant="Surface" size="500">
              <Box grow="Yes" gap="200">
                <MapPinLineIcon size="20" />
                <Text size="H4">{`Share Location ${replyDraft ? '(reply / thread)' : ''}`} </Text>
              </Box>
              <IconButton
                size="300"
                onClick={onCancel}
                radii="300"
                title="Cancel Sharing Location"
                aria-label="Cancel Sharing Location"
              >
                {composerIcon(X)}
              </IconButton>
            </Header>
            <Box direction="Column" gap="200" className={css.LocationDialogItems}>
              <Box direction="Row" className={css.LocationDialogButtons}>
                <Chip
                  variant={
                    locationError === LocationErrors.none ||
                    locationError === LocationErrors.clipboard ||
                    locationError === LocationErrors.missingClipboard
                      ? 'Primary'
                      : 'Critical'
                  }
                  className={classNames(css.LocationInputItem, css.LocationInputCurLocation)}
                  onClick={getLocation}
                  before={<MapPinAreaIcon size="18" />}
                >
                  <Text className={css.LocationInputField}>Share Current Location</Text>
                </Chip>
                <Chip
                  variant={
                    locationError !== LocationErrors.clipboard &&
                    locationError !== LocationErrors.missingClipboard
                      ? 'Secondary'
                      : 'Critical'
                  }
                  className={classNames(css.LocationInputItem, css.LocationInputClipboard)}
                  onClick={getClipboard}
                  before={<ClipboardIcon size="18" />}
                >
                  <Text className={css.LocationInputField}>Paste Clipboard</Text>
                </Chip>
              </Box>
              {locationError !== LocationErrors.none && (
                <Box className={css.LocationDialogErrorText}>
                  {chipIcon(Warning)}
                  <Text size="L400">{locationError}</Text>
                </Box>
              )}
              <Box direction="Row" gap="100" className={css.LocationInputs}>
                <Box direction="Column" className={css.LocationInputItem}>
                  <Text size="T200">Latitude</Text>
                  <Input
                    className={css.LocationInputField}
                    variant={'SurfaceVariant'}
                    size="300"
                    radii="300"
                    type="number"
                    min={-180}
                    max={180}
                    value={inputPosition.lat}
                    onChange={handleLat}
                    outlined
                  />
                </Box>
                <Box direction="Column" className={css.LocationInputItem}>
                  <Text size="T200">Longitude</Text>
                  <Input
                    className={css.LocationInputField}
                    variant={'SurfaceVariant'}
                    size="300"
                    radii="300"
                    type="number"
                    min={-180}
                    max={180}
                    value={inputPosition.lng}
                    onChange={handleLng}
                    outlined
                  />
                </Box>
              </Box>
              {showMaps && (
                <Box className={css.LocationMapBody}>
                  <MapContainer
                    center={initCoords}
                    zoom={zoom.current}
                    scrollWheelZoom={true}
                    className={css.LocationMapContainer}
                    ref={setMap}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={initCoords} />

                    <MapEvents />
                  </MapContainer>
                </Box>
              )}
              <Button
                type="submit"
                variant="Primary"
                title="Share Location"
                aria-label="Share Location"
                onClick={handleSubmit}
              >
                <Text size="B400">Share Location</Text>
              </Button>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
