# 🧠 AI-Powered Document to Webpage Converter

**The Smart Skill**: Uses Code Puppy's AI agent (that's me! 🐶) to transform documents into beautiful, Walmart-branded webpages.

## 🎯 The Architecture

### **The Smart Workflow:**

```
┌─────────────────────────────────────────────────────────────────┐
│  📄 INPUT: Document (PPTX, DOCX, PDF)                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🐍 STEP 1: Python Extraction (doc_to_web.py)                   │
│                                                                  │
│  • Extracts raw text paragraphs (in order)                      │
│  • Extracts images and saves to assets/                         │
│  • No structure detection - just raw content!                   │
│  • Output: Flat list of text + image items                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🧠 STEP 2: AI Analysis (Code Puppy Agent = Roy)                │
│                                                                  │
│  • Receives raw content                                          │
│  • Analyzes semantically (not heuristically!)                   │
│  • Understands:                                                  │
│    - Which text is a heading vs. body                           │
│    - Logical section groupings by topic                         │
│    - Relationships between text and images                      │
│    - When to use achievements vs. emphasis vs. galleries        │
│  • Returns structured JSON with sections + blocks                │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🎨 STEP 3: HTML Generation (Jinja2 Template)                   │
│                                                                  │
│  • Receives structured JSON from AI                              │
│  • Renders with Walmart-branded template                        │
│  • Components:                                                   │
│    ✓ Sticky navigation with scroll progress                     │
│    ✓ Animated hero with particles                               │
│    ✓ Achievement cards (green-bordered)                         │
│    ✓ Photo galleries (mosaic/5grid/strip)                       │
│    ✓ Two-column layouts (text + image)                          │
│    ✓ Emphasis blocks (centered, italic)                         │
│  • Output: Professional HTML + CSS website                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🌐 OUTPUT: Beautiful Walmart-Branded Website                   │
│              (index.html + assets/)                              │
└─────────────────────────────────────────────────────────────────┘
```

### **Why This Works:**

✅ **No API Keys**: Uses Code Puppy's built-in agent (me!)  
✅ **No External Services**: Everything runs locally  
✅ **Smart Analysis**: AI understands content, not just patterns  
✅ **High Quality**: Matches professionally hand-crafted sites  
✅ **Walmart Compliant**: Official colors, fonts, design tokens  

---

## ⚡ How It Works

### **The Smart Way (AI-Powered)**
1. **Extract** raw text + images from document (PPTX, DOCX, PDF)
2. **Analyze** content using AI (GPT-4, Claude, or Gemini)
3. **Structure** intelligently into sections, achievements, galleries, emphasis blocks
4. **Render** with professional Walmart-branded HTML/CSS

### **What AI Detects:**
- **Sections**: Logical groupings by topic/theme
- **Headings**: Titles and subtitles with proper hierarchy
- **Achievement Cards**: Bullet points → bordered cards
- **Photo Galleries**: Multiple images → grid layouts (mosaic, 5-grid, strip)
- **Two-Column Layouts**: Text + Image pairs
- **Emphasis Blocks**: Impactful quotes/statements
- **Content Relationships**: Which images belong with which text

---

## 🚀 Three Ways to Use This Skill

### **Mode 1: Full Auto (Recommended) **

Just ask Code Puppy to do everything:

```
Hey Code Puppy, convert my document "FY26 Report.docx" to a beautiful webpage
```

Code Puppy will:
1. Run the Python script to extract content
2. Analyze it with AI intelligence (me!)
3. Generate structured JSON
4. Build the website
5. Open it in your browser

**No setup needed!** Code Puppy handles everything.

---

### **Mode 2: Python Script (Semi-Auto)**

Run the script directly - it will invoke Code Puppy for AI analysis:

```bash
# 1. Install dependencies
uv venv .venv
source .venv/bin/activate
uv pip install -r doc-to-web-skill/requirements.txt

# 2. Run the script
python doc-to-web-skill/doc_to_web.py "document.docx" --output-dir "my-site"

# 3. The script will call Code Puppy for AI analysis automatically
```

**Note:** Code Puppy must be installed and in your PATH.

---

### **Mode 3: Manual (Full Control)**

For maximum control over each step:

```bash
# Step 1: Extract raw content
python doc-to-web-skill/doc_to_web.py "document.docx" --output-dir "temp" --extract-only

# Step 2: Manually analyze with Code Puppy
code-puppy
# Then paste the raw_content.json and ask for structured JSON

# Step 3: Build site with your JSON
python doc-to-web-skill/doc_to_web.py "document.docx" --output-dir "final-site" --structure-json "structured.json"
```

---

## 🎯 Usage

```bash
# Make sure your API key is set
export ELEMENT_API_KEY="your-key"  # or OPENAI_API_KEY

# Run the converter
python doc-to-web-skill/doc_to_web.py "path/to/document.docx" --output-dir "my-site"

# Open the result
open my-site/index.html
```

### Examples

**PowerPoint:**
```bash
python doc-to-web-skill/doc_to_web.py "Q4 Results.pptx" --output-dir "q4-site"
```

**Word Doc:**
```bash
python doc-to-web-skill/doc_to_web.py "Team Accomplishments.docx" --output-dir "accomplishments"
```

**PDF:**
```bash
python doc-to-web-skill/doc_to_web.py "Report.pdf" --output-dir "report-site"
```

---

## ✨ AI-Powered Features

### **Before (Heuristics)**
- ❌ Guesses at headings based on length
- ❌ Misses context and relationships  
- ❌ Can't understand semantic meaning
- ❌ Fragile patterns (breaks on edge cases)

### **After (AI)**
- ✅ Understands content semantically
- ✅ Detects logical sections by topic
- ✅ Pairs related text + images intelligently
- ✅ Identifies emphasis, achievements, quotes
- ✅ Adapts to different document styles

---

## 🎨 Output Quality

The AI-powered skill produces sites that match hand-crafted quality:

- **Sticky Navigation** with scroll progress
- **Animated Hero** with particles
- **Achievement Cards** (green-bordered)
- **Photo Galleries** (mosaic, 5-grid, strip)
- **Two-Column Layouts** (text + image)
- **Emphasis Blocks** (centered, italic)
- **Walmart Branding** (colors, fonts, spacing)
- **Responsive Design** (mobile-friendly)

---

## 🧪 Fallback Mode

If AI is unavailable (no API key set), the skill falls back to a simple structure:
- All content in one section
- Basic text blocks
- Images displayed sequentially

Still looks good, but not as sophisticated!

---

## 🔧 Customization

### Modify the AI Prompt
Edit `doc_to_web.py` → `ai_structure_content()` function to change how AI analyzes content.

### Adjust the Template
Edit `templates/template.html` to customize the visual design.

### Change the Model
In `doc_to_web.py`, change `model="gpt-4o"` to:
- `gpt-4o-mini` (faster, cheaper)
- `gpt-4-turbo` (more powerful)
- `claude-3-opus` (if using Anthropic)

---

## 🐶 Code Puppy Quality

**Status**: 🧠 AI-Enhanced  
**Intelligence**: LLM-powered content analysis  
**Quality**: Matches professional hand-crafted sites  
**Walmart Compliance**: 100% brand-aligned  
