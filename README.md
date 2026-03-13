# OpenFlow

> **Important note:** OpenFlow is in active development and things will change quickly. For support, feature requests, or to share what you’re building, join the Discord.  

OpenFlow is an open‑source, node‑based AI studio for images, video, audio, and text. Build generative pipelines visually on a canvas, mix local and cloud models (Gemini, OpenAI, Replicate, fal.ai, and more), and orchestrate everything through an AI canvas agent (`openAgent`) — without bouncing between separate apps.

![OpenFlow Screenshot](public/openflows.png)

## Features

- **Visual Node Editor** – Drag-and-drop nodes onto an infinite canvas, connect them, and build reusable AI pipelines.
- **Multi‑provider models** – Use Gemini, OpenAI, Replicate, fal.ai, and others from a single interface.
- **AI Image & Video** – Text-to-image/video, image-to-image, aspect‑ratio aware nodes, history carousels, and full‑bleed media nodes.
- **Prompt & Text Generation** – Rich prompt nodes with inline variables, model/toolbars, and LLM integration.
- **Annotation & Review** – Full‑screen annotation with shapes, arrows, text, and comments for marking up results.
- **Workflow Chaining** – Route outputs between nodes to create complex, multi‑step generative pipelines.
- **Saving & Sharing** – Export/import workflows as JSON for backup, collaboration, or preset libraries.
- **Execution Controls** – Group locking, per‑node run buttons, and run‑state indicators for precise control.***

## Multi-Provider Support (Beta)

In addition to Google Gemini, Openflows now supports:
- **Replicate** - Access thousands of open-source models
- **fal.ai** - Fast inference for image and video generation

Configure API keys in Project Settings to enable these providers.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Node Editor**: @xyflow/react (React Flow)
- **Canvas**: Konva.js / react-konva
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **AI**: Google Gemini API, OpenAI API, Replicate (Beta), fal.ai (Beta)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Environment Variables

Create a `.env.local` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key      # Optional, for OpenAI LLM provider
REPLICATE_API_KEY=your_replicate_api_key  # Optional, beta
FAL_API_KEY=your_fal_api_key              # Optional, beta
```

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm run start
```

## Example Workflows

The `/examples` directory contains some example workflow files from my personal projects. To try them:

1. Start the dev server with `npm run dev`
2. Drag any `.json` file from the `/examples` folder into the browser window
3. Make sure you review each of the prompts before starting, these are fairly targetted to the examples. 

## Usage

1. **Add nodes** - Click the floating action bar to add nodes to the canvas
2. **Connect nodes** - Drag from output handles to input handles (matching types only)
3. **Configure nodes** - Adjust settings like model, aspect ratio, or drawing tools
4. **Run workflow** - Click the Run button to execute the pipeline
5. **Save/Load** - Use the header menu to save or load workflows

## Connection Rules

- **Image** handles connect to **Image** handles only
- **Text** handles connect to **Text** handles only
- Image inputs on generation nodes accept multiple connections
- Text inputs accept single connections

## Roadmap / TODO

OpenFlow aims to be a full AI suite — no switching between apps. Everything in one place.

### Image

- Image generation — text-to-image, image-to-image, upscaling
- Image enhancement — clarity, crystal, Topaz upscalers
- In-painting — edit within selected regions
- Out-painting — extend images beyond borders
- Image compositor — layer and blend multiple images
- Image merging — combine images intelligently
- Image re-styling — apply new styles to existing images
- Visual variations — generate variations from a source image
- Visual referencing — use reference images for generation
- Character consistency — keep characters consistent across generations
- Image to text — describe or caption images
- Prompt enhancing — auto-improve prompts for better results

### Image Controllers

- Image relight — adjust lighting in images
- Light controller — control light direction and intensity
- Pose controller — control body pose
- Depth controller — control depth maps
- Edge controller — control edges and outlines

### Audio

- Text-to-speech — generate speech from text (OpenAI TTS)
- Voice cloning — clone voices from samples
- Speech-to-text — transcribe audio to text
- Audio generation — generate music, sound effects, ambient audio
- Voice conversion — convert voice style or accent
- Audio enhancement — noise reduction, clarity, upscaling

### Video

- Video generation — generate video from prompts (Seedance, etc.)
- Video enhancement — upscale and improve video quality (Topaz)
- Video compositor — layer and blend video clips

### Editing & Controllability

- Image editing — general-purpose image editing nodes
- Controllability — fine-grained control over generation (structure, style, composition)

### openAgent

- openAgent — AI agent inside the Flow canvas. Describe what you want; it adds nodes, picks models, connects pipelines, runs generations, and organizes output — all from conversation.

## Keywords / Tags

weavy-ai-alternative · krea-nodes-alternative · freepik-spaces-alternative · florafauna-ai-alternative · open-source-ai-workflow · node-based-ai-editor · generative-ai-pipeline · comfyui-alternative · visual-ai-workflow · self-hosted-ai · ai-image-generation · ai-video-generation · no-code-ai · artistic-intelligence · ai-os · electron-desktop · gpt-4 · replicate · openai · ai-text-generation · local-ai · multi-modal-ai · desktop-app · openagent · ai-canvas-agent

## Testing

Run the test suite with:

```bash
npm test              # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
```

## Contributing

Contributions are welcome! Please see `CONTRIBUTING.md` for guidelines.

We also adhere to the Contributor Covenant Code of Conduct. By participating, you agree to uphold our community standards.

## License

This project is open source. See the `LICENSE` file for details.
