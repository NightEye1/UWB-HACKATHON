require('dotenv').config({ path: '../.env.local' }); // Adjust path if your .env is in the root
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware ---
// CORS allows the Lovable React frontend to communicate with this backend
app.use(cors());
// Parses incoming JSON payloads from the frontend
app.use(express.json());

// --- Initialize AI Client ---
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- Health Check Route ---
app.get('/', (req, res) => {
    res.status(200).send('PermitPilot Orchestrator is online.');
});

// --- Agent Engine ---
async function callDomainAgent(agentName, systemRules, userData) {
    console.log(`[🤖] Waking up ${agentName} Agent...`);
    try {
        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            temperature: 0.1, // Low temp for strict rule-following
            system: `You are the ${agentName}. You are a strict API endpoint. 
            Evaluate the user's application against these municipal codes: 
            ${systemRules}
            
            You MUST return ONLY a valid JSON object. No markdown formatting, no conversational text.
            Required JSON schema:
            {
                "agency": "${agentName}",
                "status": "approved" | "conflict",
                "notes": "Brief explanation",
                "citations": ["SMC ..."],
                "required_forms": [{"form_name": "...", "url": "..."}]
            }`,
            messages: [
                { role: "user", content: JSON.stringify(userData) }
            ]
        });

        // Parse Claude's text response into an actual JSON object
        return JSON.parse(response.content[0].text);
    } catch (error) {
        console.error(`[❌] ${agentName} Agent failed:`, error);
        return { agency: agentName, status: "error", notes: "Agent offline." };
    }
}

// --- The Core Orchestrator Endpoint ---
app.post('/api/evaluate-permit', async (req, res) => {
    try {
        const intakeData = req.body;
        console.log(`[📦] Received payload for application: ${intakeData.application_id}`);

        if (!intakeData || Object.keys(intakeData).length === 0) {
            return res.status(400).json({ error: "Empty payload received" });
        }

        // 1. Load Vivek's mock data (For right now, we will use hardcoded strings to test)
        // Once Vivek finishes the files, you can use fs.readFileSync('../data/zoning_code.json')
        const zoningRules = "SMC 15.17.005: Food trucks cannot operate within 50 feet of a park.";
        const healthRules = "KCBOH Title 5: Open food prep requires a Level 3 permit and commissary kitchen.";

        console.log(`[⚡] Firing Domain Agents in parallel...`);
        
        // 2. Execute all agents simultaneously
        const [zoningResult, healthResult] = await Promise.all([
            callDomainAgent("Zoning Authority", zoningRules, intakeData),
            callDomainAgent("Health Department", healthRules, intakeData)
        ]);

        // 3. The Orchestrator Synthesis (Merging the results)
        // In a full build, Claude does this part too. For speed, we will do it in code.
        const allResults = [zoningResult, healthResult];
        const hasConflict = allResults.some(res => res.status === 'conflict');

        const finalChecklist = [];
        allResults.forEach(res => {
            if (res.required_forms) {
                finalChecklist.push(...res.required_forms);
            }
        });

        // 4. Send the final compiled package back to Shivek's frontend
        res.status(200).json({
            status: "success",
            conflict_detected: hasConflict,
            agent_details: allResults,
            unified_checklist: finalChecklist
        });

        // Temporary mock response to verify frontend-to-backend wiring
        res.status(200).json({
            status: "success",
            message: "API Gateway hit successfully. Ready for Claude agents.",
            received_project_type: intakeData.project_type
        });

    } catch (error) {
        console.error("[❌] Orchestrator Error:", error);
        res.status(500).json({ 
            status: "error",
            message: "The Orchestrator encountered a fatal error.",
            details: error.message
        });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 PermitPilot API Gateway listening at http://localhost:${PORT}`);
    console.log(`Waiting for frontend payloads...`);
});