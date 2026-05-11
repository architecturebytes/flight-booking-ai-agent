# AI-Powered Flight Booking Application - using Gemini Live

Refer YouTube Video: https://www.youtube.com/watch?v=SMQnJ-KI5nI

This is a flight booking Agentic Application that combines conversational voice AI with real-time geospatial visualization. It features a voice-first interface powered by the **Gemini Multimodal Live API**.

## 🚀 Features

- **Voice-Activated Search:** Use natural language to find flights, book itineraries, and walkthrough your travel plans.
- **Interactive Map:** High-performance geospatial visualization with animated flight paths.
- **Gemini Live Integration:** Low-latency, bidirectional audio streaming for a human-like conversational experience.
- **Context-Aware Themes:** Map styles that automatically adapt (Satellite, Dark Matter, Voyager) based on the application state.
- **Interactive Flight Booking:** Helpful audio/visual flight booking.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Mapping:** React Leaflet, OpenStreetMap (Nominatim API)
- **AI:** Gemini 2.5 Flash (Multimodal Live API via WebSockets)
- **Icons:** Lucide React
- **Styling:** Vanilla CSS (Glassmorphism design)

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- A [Google AI Studio API Key](https://aistudio.google.com/app/apikey)

## ⚙️ Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/flight-booking-ai-agent.git
   cd flight-booking-ai-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the `.env.example` file to `.env` file in the root directory and update with your Gemini API key:
   ```env
   VITE_GEMINI_API_KEY=your_api_key_here
   VITE_GEMINI_MODEL=models/gemini-2.5-flash-native-audio-latest
   ```

4. **Run the application:**
   ```bash
   npm run dev
   ```

5. **Open in Browser:**
   Navigate to `http://localhost:5173` to see the app in action.

## 🎙️ How to Use

1. Click the **Microphone** button at the bottom center to start the voice assistant.
2. Say something like: *"I want to fly from New York to London tomorrow."*
3. Explore the flights found on the map.
4. Say *"Please book the <FlightName> flight"* or click the **Book** button.
5. Once the booking panel opens review it and then say something like *"Please confirm this booking"* 
6. Once booked, ask the AI: *"Can you walk me through my itinerary?"* to see the map walkthrough feature.

## ⚖️ License & Attribution

- **Map Engine:** Leaflet (BSD 2-Clause License)
- **Map Data:** © OpenStreetMap contributors
- **UI Icons:** Lucide React (ISC License)

---
*Developed as a demonstration of the Gemini Multimodal Live API.*
