import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, ZoomControl, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plane, MapPin, Loader2, ArrowRight, Mic, MicOff, X } from 'lucide-react';

// Fix for default marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --- CONFIGURATION ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL;
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const MAP_THEMES = [
  { id: 'voyager', name: 'Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' },
  { id: 'dark', name: 'Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
  { id: 'satellite', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { id: 'positron', name: 'Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' }
];

interface FlightPathData {
  id: string;
  points: [number, number][];
  color: string;
  label: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  segments: string[];
  hubs: { name: string; pos: [number, number]; airline: string }[];
  distance: number;
  duration: string;
  price: number;
  searchDate: string;
}

// Component to handle map movement
function MapUpdater({ bounds }: { bounds?: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds, { 
        padding: [80, 80], 
        duration: 3 
      });
    }
  }, [bounds, map]);
  return null;
}

// Bezier Curve Logic
function generateCurvePoints(start: [number, number], end: [number, number], segments = 50) {
  const points: [number, number][] = [];
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;
  const midLat = (lat1 + lat2) / 2;
  const distance = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2));
  const offset = distance * 0.2;
  const ctrlLat = midLat + offset;
  const ctrlLon = (lon1 + lon2) / 2;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = Math.pow(1 - t, 2) * lat1 + 2 * (1 - t) * t * ctrlLat + Math.pow(t, 2) * lat2;
    const lon = Math.pow(1 - t, 2) * lon1 + 2 * (1 - t) * t * ctrlLon + Math.pow(t, 2) * lon2;
    points.push([lat, lon]);
  }
  return points;
}

function AnimatedPlane({ path, color, airline, opacity = 1, restartTrigger }: { path: [number, number][], color: string, airline: string, opacity?: number, restartTrigger?: any }) {
  const [position, setPosition] = useState<[number, number]>(path[0]);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setPosition(path[0]);
  }, [path, restartTrigger]);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index >= path.length - 1) index = 0;
      const p1 = path[index];
      const p2 = path[index + 1];
      if (!p1 || !p2) return;
      const deltaLat = p2[0] - p1[0];
      const deltaLon = p2[1] - p1[1];
      setRotation(Math.atan2(deltaLon, deltaLat) * (180 / Math.PI));
      setPosition(p2);
      index++;
    }, 150);
    return () => clearInterval(interval);
  }, [path, restartTrigger]);

  const planeIcon = L.divIcon({
    className: 'animated-plane-icon',
    html: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; opacity: ${opacity}; transition: opacity 0.3s;">
             <div class="${restartTrigger !== undefined ? 'plane-pulse' : ''}" style="color: ${color}; filter: drop-shadow(0 0 8px ${color}); transform: rotate(${rotation - 45}deg);">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
             </div>
             <div style="background: rgba(10, 10, 15, 0.9); color: white; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; border: 2px solid ${color}; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
               ${airline}
             </div>
           </div>`,
    iconSize: [100, 50],
    iconAnchor: [50, 25]
  });

  return <Marker position={position} icon={planeIcon} zIndexOffset={1000} />;
}

function calculateDistance(points: [number, number][]) {
  const R = 6371;
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[i + 1];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    totalDistance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(totalDistance);
}

// --- MAIN COMPONENT ---

function App() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0]);
  const [passengerName, setPassengerName] = useState('John Doe');
  const [originPos, setOriginPos] = useState<[number, number] | null>(null);
  const [destPos, setDestPos] = useState<[number, number] | null>(null);
  const originPosRef = useRef<[number, number] | null>(null);
  const destPosRef = useRef<[number, number] | null>(null);
  const [flightPaths, setFlightPaths] = useState<FlightPathData[]>([]);
  const flightPathsRef = useRef<FlightPathData[]>([]);
  const [bookingRoute, setBookingRoute] = useState<FlightPathData | null>(null);
  const bookingRouteRef = useRef<FlightPathData | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [bounds, setBounds] = useState<L.LatLngBoundsExpression | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Voice assistant ready.');
  const [mapTheme, setMapTheme] = useState(MAP_THEMES[0]);
  const [bookedFlights, setBookedFlights] = useState<{
    date: string, 
    airline: string, 
    origin: string, 
    destination: string, 
    flightNumber: string,
    points: [number, number][],
    originPos: [number, number],
    destPos: [number, number],
    color: string
  }[]>([]);
  const bookedFlightsRef = useRef(bookedFlights);
  const [highlightedBookedFlight, setHighlightedBookedFlight] = useState<number | null>(null);
  const departureDateRef = useRef(departureDate);

  useEffect(() => {
    departureDateRef.current = departureDate;
  }, [departureDate]);

  useEffect(() => {
    originPosRef.current = originPos;
  }, [originPos]);

  useEffect(() => {
    destPosRef.current = destPos;
  }, [destPos]);

  useEffect(() => {
    bookedFlightsRef.current = bookedFlights;
  }, [bookedFlights]);

  // Automatic theme switching based on booking lifecycle
  useEffect(() => {
    if (bookingRoute) {
      const darkTheme = MAP_THEMES.find(t => t.id === 'dark');
      if (darkTheme) setMapTheme(darkTheme);
    } else {
      const voyagerTheme = MAP_THEMES.find(t => t.id === 'voyager');
      if (voyagerTheme) setMapTheme(voyagerTheme);
    }
  }, [bookingRoute]);

  // Gemini Live State
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);

  useEffect(() => {
    flightPathsRef.current = flightPaths;
  }, [flightPaths]);

  useEffect(() => {
    bookingRouteRef.current = bookingRoute;
  }, [bookingRoute]);

  // Helper: Geocode location
  const geocode = async (query: string) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await response.json();
      return data[0] ? { pos: [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number], name: data[0].display_name } : null;
    } catch { return null; }
  };

  const handleFindFlights = useCallback(async (src: string, dst: string, preferredDate?: string) => {
    setLoading(true);
    setFlightPaths([]);
    setBookingRoute(null);
    setIsBooked(false);
    setHighlightedBookedFlight(null); // Reset walkthrough on new search
    setStatus(`Searching flights to ${dst}...`);
    
    // Ensure valid searchDate
    let searchDateInput = preferredDate || departureDateRef.current;
    const dateObj = new Date(searchDateInput);
    const validDate = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const searchDate = validDate;
    
    const originData = await geocode(src);
    await new Promise(r => setTimeout(r, 600));
    const destData = await geocode(dst);

    if (originData && destData) {
      setOriginPos(originData.pos);
      setDestPos(destData.pos);
      const paths: FlightPathData[] = [];
      const colors = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981'];
      const searchId = Date.now();
      
      const airlines = ['Aether Link', 'Skybound', 'Horizon Air', 'Nova Jet', 'Velocity'];
      const directAirline = airlines[Math.floor(Math.random() * airlines.length)];
      
      const points = generateCurvePoints(originData.pos, destData.pos);
      const dist = calculateDistance(points);
      const seed = Math.floor(Math.random() * 5);
      
      const directPath: FlightPathData = {
        id: `direct-${searchId}`, points, color: colors[0], label: 'Direct Flight', airline: directAirline,
        flightNumber: `${directAirline.charAt(0)}L${Math.floor(100 + Math.random() * 900)}`,
        departureTime: `${7 + seed}:30 AM`, arrivalTime: `${10 + seed}:45 AM`,
        segments: [src, dst], hubs: [], distance: dist, duration: `${Math.max(1, Math.floor(dist / 800))}h`, price: Math.floor(dist * 0.12 + 200 + Math.random() * 40),
        searchDate: searchDate
      };
      paths.push(directPath);

      const allHubs = [
        { name: 'Dubai (DXB)', pos: [25.2532, 55.3657] as [number, number], airline: 'Global Hub Air' },
        { name: 'Singapore (SIN)', pos: [1.3502, 103.9945] as [number, number], airline: 'Pacific Link' },
        { name: 'London (LHR)', pos: [51.4700, -0.4543] as [number, number], airline: 'Royal Skyline' },
        { name: 'Tokyo (NRT)', pos: [35.7767, 140.3183] as [number, number], airline: 'Zen Jet' },
        { name: 'Frankfurt (FRA)', pos: [50.0379, 8.5622] as [number, number], airline: 'Euro Wings' }
      ];

      const selectedHubs = allHubs.sort(() => 0.5 - Math.random()).slice(0, 1 + Math.floor(Math.random() * 2));

      selectedHubs.forEach((hub, idx) => {
        const hubPoints = [originData.pos, hub.pos, destData.pos];
        let allPoints: [number, number][] = [];
        for (let i = 0; i < hubPoints.length - 1; i++) {
          const segment = generateCurvePoints(hubPoints[i], hubPoints[i+1], 25);
          if (i > 0) segment.shift();
          allPoints = [...allPoints, ...segment];
        }
        
        const hDist = calculateDistance(allPoints);
        const hubPath: FlightPathData = {
          id: `hub-${idx}-${searchId}`, points: allPoints, color: colors[idx + 1] || '#ffffff', 
          label: `Via ${hub.name}`, airline: hub.airline,
          flightNumber: `${hub.airline.charAt(0)}H${Math.floor(100 + Math.random() * 900)}`,
          departureTime: `${9 + idx + seed}:15 AM`, arrivalTime: `${5 + idx + seed}:20 PM`,
          segments: [src, hub.name, dst], hubs: [hub], 
          distance: hDist, duration: `${Math.max(1, Math.floor(hDist / 800) + 2)}h`, price: Math.floor(hDist * 0.1 + 150 + Math.random() * 30),
          searchDate: searchDate
        };
        paths.push(hubPath);
      });

      setFlightPaths(paths);
      const newBounds = L.latLngBounds([originData.pos, destData.pos]);
      selectedHubs.forEach(h => newBounds.extend(h.pos));
      setBounds(newBounds.pad(0.1));
      setStatus(`Found ${paths.length} options.`);
      setLoading(false);
      return paths;
    } else {
      setStatus(`Error: Could not locate ${!originData ? src : dst}.`);
    }
    setLoading(false);
    return [];
  }, []);

  const stopLiveSession = useCallback(() => {
    setIsLive(false);
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());
    processorRef.current?.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    setStatus('Voice assistant offline.');
  }, []);

  const playNextInQueue = useCallback(() => {
    if (isPlaying.current || audioQueue.current.length === 0 || !audioContextRef.current || audioContextRef.current.state === 'closed') return;
    isPlaying.current = true;
    const pcmData = audioQueue.current.shift()!;
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
    buffer.copyToChannel(floatData, 0);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlaying.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const startLiveSession = async () => {
    if (isLive || isConnecting) return;
    setIsConnecting(true);
    setStatus('Requesting Mic...');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioContextRef.current = audioCtx;

      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLive(true);
        setIsConnecting(false);
        setStatus('AI is listening...');
        
        ws.send(JSON.stringify({
          setup: {
            model: GEMINI_MODEL,
            generation_config: { response_modalities: ["audio"] },
            system_instruction: {
              parts: [{ text: "You are Aether Link, a flight booking AI. \n\n1. Use 'find_flights' for city/date mentions. \n2. When flights are found, always mention the specific airline names returned by the tool. \n3. Use 'book_flight' to open the panel when a user selects one of the available flights. \n4. Use 'confirm_booking' when the user says 'Yes', 'Confirm', 'Proceed', or 'Book it' while the panel is open. \n5. When a booking is confirmed, summarize the itinerary: source, destination, timings, airline, and flight number. \n6. If the user asks for a walkthrough or summary of upcoming flights, use 'get_itinerary' to see their bookings, then for each flight, use 'show_itinerary_item' (passing the index) to animate it on the map while you describe it. Walk through them one by one." }]
            },
            tools: [{
              function_declarations: [
                {
                  name: "find_flights",
                  description: "Search for flights between an origin and destination.",
                  parameters: {
                    type: "OBJECT",
                    properties: { origin: { type: "STRING" }, destination: { type: "STRING" }, date: { type: "STRING" } },
                    required: ["origin", "destination"]
                  }
                },
                {
                  name: "book_flight",
                  description: "Open the booking panel for a specific airline from the search results.",
                  parameters: { type: "OBJECT", properties: { airline: { type: "STRING" } } }
                },
                {
                  name: "confirm_booking",
                  description: "Finalize the booking after the user confirms.",
                  parameters: { type: "OBJECT", properties: {} }
                },
                {
                  name: "get_itinerary",
                  description: "Get the list of all booked/upcoming flights.",
                  parameters: { type: "OBJECT", properties: {} }
                },
                {
                  name: "show_itinerary_item",
                  description: "Focus the map and show animation for a specific booked flight by its index.",
                  parameters: {
                    type: "OBJECT",
                    properties: { index: { type: "NUMBER" } },
                    required: ["index"]
                  }
                }
              ]
            }]
          }
        }));

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          
          const uint8Array = new Uint8Array(pcmData.buffer);
          let binary = '';
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              realtime_input: { media_chunks: [{ data: base64, mime_type: "audio/pcm;rate=16000" }] } 
            }));
          }
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = async (event) => {
        let responseStr = '';
        if (event.data instanceof Blob) responseStr = await event.data.text();
        else if (event.data instanceof ArrayBuffer) responseStr = new TextDecoder().decode(event.data);
        else responseStr = event.data;

        const response = JSON.parse(responseStr);
        
        const audioData = response.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData) {
          const binary = atob(audioData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          audioQueue.current.push(new Int16Array(bytes.buffer));
          playNextInQueue();
        }

        if (response.serverContent?.interrupted) {
          audioQueue.current = [];
          isPlaying.current = false;
        }

        const toolCall = response.serverContent?.toolCall || response.toolCall;
        const functionCalls = toolCall?.functionCalls;
        if (functionCalls) {
          for (const call of functionCalls) {
            if (call.name === 'find_flights') {
              const { origin: o, destination: d, date: dt } = call.args;
              setOrigin(o); setDestination(d);
              if (dt) setDepartureDate(dt);
              const foundPaths = await handleFindFlights(o, d, dt);
              const airlinesFound = foundPaths.map(p => p.airline).join(", ");
              ws.send(JSON.stringify({ 
                tool_response: { function_responses: [{ name: "find_flights", response: { result: `Found flights from: ${airlinesFound}` }, id: call.id }] } 
              }));
            }
            if (call.name === 'book_flight') {
              const targetAirline = call.args.airline?.toLowerCase();
              let matchedRoute = flightPathsRef.current[0];
              if (targetAirline) {
                const found = flightPathsRef.current.find(p => p.airline.toLowerCase().includes(targetAirline) || p.label.toLowerCase().includes(targetAirline));
                if (found) matchedRoute = found;
              }
              if (matchedRoute) setBookingRoute(matchedRoute);
              ws.send(JSON.stringify({ tool_response: { function_responses: [{ name: "book_flight", response: { result: "Booking panel opened" }, id: call.id }] } }));
            }
            if (call.name === 'confirm_booking') {
              setIsBooked(true);
              const br = bookingRouteRef.current;
              const flightDate = (br as any)?.searchDate || departureDateRef.current;
              const oPos = originPosRef.current;
              const dPos = destPosRef.current;
              
              if (br && oPos && dPos) {
                setBookedFlights(prev => [...prev, { 
                  date: flightDate, 
                  airline: br.airline,
                  origin: br.segments[0] || 'Unknown',
                  destination: br.segments[br.segments.length - 1] || 'Unknown',
                  flightNumber: br.flightNumber || 'N/A',
                  points: br.points,
                  originPos: oPos,
                  destPos: dPos,
                  color: br.color
                }]);
              }
              const details = br ? `${br.airline} flight ${br.flightNumber} from ${br.segments[0]} to ${br.segments[br.segments.length-1]} on ${flightDate}` : "Success";
              ws.send(JSON.stringify({ 
                tool_response: { function_responses: [{ name: "confirm_booking", response: { result: `Booking confirmed for ${details}.` }, id: call.id }] } 
              }));
            }
            if (call.name === 'get_itinerary') {
              const currentItinerary = bookedFlightsRef.current;
              const list = currentItinerary.map((f, i) => `${i}: ${f.airline} from ${f.origin} to ${f.destination} on ${f.date}`).join("; ");
              ws.send(JSON.stringify({ 
                tool_response: { function_responses: [{ name: "get_itinerary", response: { result: list || "No upcoming flights." }, id: call.id }] } 
              }));
            }
            if (call.name === 'show_itinerary_item') {
              const idx = call.args.index;
              const currentItinerary = bookedFlightsRef.current;
              const flight = currentItinerary[idx];
              if (flight) {
                setFlightPaths([]); 
                setBookingRoute(null);
                setOriginPos(null);
                setDestPos(null);
                setIsBooked(false);
                setHighlightedBookedFlight(idx);
                
                // Switch to dark theme
                const darkTheme = MAP_THEMES.find(t => t.id === 'dark');
                if (darkTheme) setMapTheme(darkTheme);

                const newBounds = L.latLngBounds([flight.originPos, flight.destPos]);
                setBounds(newBounds.pad(0.5));
                ws.send(JSON.stringify({ 
                  tool_response: { function_responses: [{ name: "show_itinerary_item", response: { result: `Map centered on ${flight.origin} to ${flight.destination}.` }, id: call.id }] } 
                }));
              } else {
                ws.send(JSON.stringify({ 
                  tool_response: { function_responses: [{ name: "show_itinerary_item", response: { result: "Flight index not found." }, id: call.id }] } 
                }));
              }
            }
          }
        }
      };

      ws.onclose = () => {
        setIsConnecting(false);
        stopLiveSession();
      };
      ws.onerror = () => stopLiveSession();

    } catch (err) {
      setIsConnecting(false);
      setStatus('Mic Error');
    }
  };

  return (
    <div className="app-container">
      <MapContainer center={[20, 0]} zoom={2} className="map-container" zoomControl={false}>
        <TileLayer url={mapTheme.url} />
        <MapUpdater bounds={bounds} />
        {originPos && (
          <Marker position={originPos}>
            <Tooltip permanent className={isBooked ? 'leaflet-tooltip-active' : ''}>
              <div className="city-tooltip-content">
                <span className="city-name">{origin}</span>
                {bookingRoute && <span className="city-time-badge">{bookingRoute.departureTime}</span>}
              </div>
            </Tooltip>
          </Marker>
        )}
        {destPos && (
          <Marker position={destPos}>
            <Tooltip permanent className={isBooked ? 'leaflet-tooltip-active' : ''}>
              <div className="city-tooltip-content">
                <span className="city-name">{destination}</span>
                {bookingRoute && <span className="city-time-badge">{bookingRoute.arrivalTime}</span>}
              </div>
            </Tooltip>
          </Marker>
        )}
        {flightPaths.map((path) => {
          const isSelected = bookingRoute ? bookingRoute.id === path.id : true;
          const isConfirmedPath = isBooked && bookingRoute?.id === path.id;
          const displayOpacity = isBooked ? (isConfirmedPath ? 1 : 0.4) : (isSelected ? 0.8 : 0.4);
          const displayWeight = isBooked ? (isConfirmedPath ? 6 : 2) : (isSelected ? 5 : 2);
          
          return (
            <React.Fragment key={path.id}>
              <Polyline 
                positions={path.points} 
                pathOptions={{ color: path.color, weight: displayWeight, opacity: displayOpacity }} 
              />
              <AnimatedPlane 
                path={path.points} 
                color={path.color} 
                airline={path.airline} 
                opacity={displayOpacity} 
              />
              {path.hubs.map((hub, hIdx) => {
                const isHubVisible = isBooked ? isConfirmedPath : isSelected;
                const hubOpacity = isBooked ? (isConfirmedPath ? 1 : 0.4) : (isHubVisible ? 1 : 0.4);
                return (
                  <Marker key={`${path.id}-hub-${hIdx}`} position={hub.pos} icon={L.divIcon({ className: 'hub-dot-icon', html: `<div style="background: ${path.color}; border: 1px solid white; width: 8px; height: 8px; border-radius: 50%; opacity: ${hubOpacity};"></div>`, iconSize: [8, 8], iconAnchor: [4, 4] })}>
                    <Tooltip permanent direction="top" offset={[0, -10]} opacity={hubOpacity}><span style={{ fontSize: '0.7rem' }}>{hub.name.split(' ')[0]}</span></Tooltip>
                  </Marker>
                );
              })}
            </React.Fragment>
          );
        })}

        <ZoomControl position="bottomleft" />

        {/* Walkthrough - Show ALL Booked Flights */}
        {highlightedBookedFlight !== null && bookedFlights.map((flight, idx) => {
          const isHighlighted = highlightedBookedFlight === idx;
          return (
            <React.Fragment key={`walkthrough-${idx}-${isHighlighted}`}>
              <Polyline 
                positions={flight.points} 
                pathOptions={{ 
                  color: flight.color, 
                  weight: 4, 
                  opacity: isHighlighted ? 1 : 0.6
                }} 
              />
              <AnimatedPlane 
                path={flight.points} 
                color={flight.color} 
                airline={flight.airline} 
                opacity={isHighlighted ? 1 : 0.7}
                restartTrigger={isHighlighted ? highlightedBookedFlight : undefined}
              />
              {isHighlighted && (
                <>
                  <Marker position={flight.originPos}>
                    <Tooltip permanent className="walkthrough-tooltip">
                      <div className="city-tooltip-content highlight">
                        <span className="city-name">{flight.origin}</span>
                      </div>
                    </Tooltip>
                  </Marker>
                  <Marker position={flight.destPos}>
                    <Tooltip permanent className="walkthrough-tooltip">
                      <div className="city-tooltip-content highlight">
                        <span className="city-name">{flight.destination}</span>
                      </div>
                    </Tooltip>
                  </Marker>
                </>
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>

      <div className="theme-panel">
        {MAP_THEMES.map(t => (
          <button 
            key={t.id} 
            className={`theme-btn ${mapTheme.id === t.id ? 'active' : ''}`}
            onClick={() => setMapTheme(t)}
          >
            {t.name}
          </button>
        ))}
      </div>

      {bookedFlights.length > 0 && (
        <div className="booked-summary-mini">
          <div className="booked-count">
            <Plane size={14} />
            <span>{bookedFlights.length} Upcoming Flight{bookedFlights.length > 1 ? 's' : ''}</span>
          </div>
          <div className="booked-list">
            {bookedFlights.map((flight, index) => (
              <div key={index} className="booked-item-line" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', fontSize: '0.8rem' }}>
                  <span className="mini-airline" style={{ width: '80px', fontWeight: 'bold', color: '#fbbf24', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flight.airline}</span>
                  <span className="mini-flight" style={{ width: '50px', color: '#94a3b8' }}>{flight.flightNumber}</span>
                  <span className="mini-route" style={{ flex: 1, textAlign: 'center', color: '#f8fafc', whiteSpace: 'nowrap' }}>{flight.origin} → {flight.destination}</span>
                  <span className="mini-date" style={{ width: '70px', textAlign: 'right', color: '#e2e8f0' }}>
                    {(() => {
                      const d = new Date(flight.date);
                      return isNaN(d.getTime()) ? 'No Date' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                    })()}
                  </span>
                </div>
            ))}
          </div>
        </div>
      )}

      <div className="overlay">
        <div className="flight-panel">
          <div className="input-group"><MapPin size={18} /><input className="search-input" placeholder="From..." value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
          <div className="input-group"><Plane size={18} /><input className="search-input" placeholder="To..." value={destination} onChange={(e) => setDestination(e.target.value)} /></div>
          <div className="input-group"><ArrowRight size={18} /><input type="date" className="search-input date-input" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} /></div>
          <button className="find-flights-btn" onClick={() => handleFindFlights(origin, destination)} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : "Search Flights"}</button>
        </div>

        {flightPaths.length > 0 && (
          <div className="routes-legend">
            {flightPaths.map(p => (
              <div key={p.id} className={`legend-item ${bookingRoute?.id === p.id ? 'active' : ''}`} onClick={() => setBookingRoute(p)}>
                <div className="route-info">
                  <div className="airline-name">{p.airline} • {p.flightNumber}</div>
                  <div className="route-timing" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {p.departureTime} - {p.arrivalTime} 
                    <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                      {(() => {
                        const d = new Date(p.searchDate);
                        return isNaN(d.getTime()) ? p.searchDate : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                      })()}
                    </span>
                  </div>
                  <div className="route-label" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.label}</div>
                  <div className="route-stats">${p.price} • {p.duration}</div>
                </div>
                <button className="book-btn" onClick={(e) => { e.stopPropagation(); setBookingRoute(p); }}>Book</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {bookingRoute && (
        <div className="booking-modal-overlay">
          <div className="booking-modal">
            <div className="modal-header">
              <h3>{isBooked ? 'Booking Confirmed!' : 'Confirm Booking'}</h3>
              <button className="close-modal" onClick={() => {setBookingRoute(null); setIsBooked(false);}}><X /></button>
            </div>
            {isBooked ? (
              <div className="success-view">
                <div className="ticket-header">
                  <Plane size={24} className="ticket-icon" />
                  <span>Ready for Takeoff</span>
                </div>
                
                <div className="boarding-pass">
                  <div className="pass-section">
                    <div className="pass-group">
                      <span className="pass-label">DEPARTURE</span>
                      <span className="pass-value">{bookingRoute.segments[0]}</span>
                      <span className="pass-sub">{bookingRoute.searchDate || departureDate} • {bookingRoute.departureTime}</span>
                    </div>
                    <ArrowRight className="pass-arrow" />
                    <div className="pass-group" style={{ textAlign: 'right' }}>
                      <span className="pass-label">ARRIVAL</span>
                      <span className="pass-value">{bookingRoute.segments[bookingRoute.segments.length - 1]}</span>
                      <span className="pass-sub">{bookingRoute.arrivalTime}</span>
                    </div>
                  </div>

                  <div className="pass-divider"></div>

                  <div className="pass-details">
                    <div className="detail-item"><span className="label">PASSENGER</span><span className="value">{passengerName}</span></div>
                    <div className="detail-item"><span className="label">AIRLINE</span><span className="value">{bookingRoute.airline}</span></div>
                    <div className="detail-item"><span className="label">FLIGHT</span><span className="value">{bookingRoute.flightNumber}</span></div>
                  </div>
                </div>

                <p className="success-footer">Your digital tickets have been sent to your email. Safe travels!</p>
                <button className="confirm-btn" onClick={() => {setBookingRoute(null); setIsBooked(false);}}>Close</button>
              </div>
            ) : (
              <div className="booking-summary">
                <div className="summary-item">
                  <span className="label">Passenger</span>
                  <input type="text" className="modal-input" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} />
                </div>
                <div className="summary-item"><span className="label">Airline</span><span className="value">{bookingRoute.airline} ({bookingRoute.flightNumber})</span></div>
                <div className="summary-item"><span className="label">Route</span><span className="value">{bookingRoute.segments.join(' → ')}</span></div>
                <div className="summary-item"><span className="label">Timings</span><span className="value">{bookingRoute.departureTime} - {bookingRoute.arrivalTime}</span></div>
                <div className="summary-item"><span className="label">Date</span><span className="value">{bookingRoute.searchDate || departureDate}</span></div>
                <div className="summary-item"><span className="label">Total</span><span className="value total">${bookingRoute.price}</span></div>
                <button className="confirm-btn" onClick={() => {
                  setIsBooked(true);
                  const routeDate = bookingRoute.searchDate || departureDate;
                  const oP = originPos || originPosRef.current;
                  const dP = destPos || destPosRef.current;
                  if (oP && dP) {
                    setBookedFlights(prev => [...prev, { 
                      date: routeDate, 
                      airline: bookingRoute.airline,
                      origin: bookingRoute.segments[0] || 'Unknown',
                      destination: bookingRoute.segments[bookingRoute.segments.length - 1] || 'Unknown',
                      flightNumber: bookingRoute.flightNumber || 'N/A',
                      points: bookingRoute.points,
                      originPos: oP,
                      destPos: dP,
                      color: bookingRoute.color
                    }]);
                  }
                }}>Confirm Booking</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isLive && <div className="voice-hud"><div className="listening-ring" /></div>}
      <button className={`voice-cmd-btn ${isLive ? 'active' : ''}`} onClick={isLive ? stopLiveSession : startLiveSession}>{isLive ? <MicOff size={24} /> : <Mic size={24} />}</button>
      <div className="status-badge"><div className={`status-dot ${isLive ? 'live' : ''}`} /><span>{status}</span></div>
    </div>
  );
}

export default App;
