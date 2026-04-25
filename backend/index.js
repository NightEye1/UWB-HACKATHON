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
//*/

/*/ --- TEMPORARY MOCKED AGENT ENGINE ---
async function callDomainAgent(agentName, systemRules, userData) {
    console.log(`[🤖] Waking up ${agentName} Agent (MOCKED)...`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (agentName === "Zoning Authority") {
        return {
            "agency": "Zoning Authority",
            "status": "conflict",
            "notes": "Food truck is placed 45 feet from a park boundary, which violates the 50-foot minimum.",
            "citations": ["SMC 15.17.005"],
            "required_forms": []
        };
    }

    if (agentName === "Health Department") {
        return {
            "agency": "Health Department",
            "status": "approved",
            "notes": "Open food prep requires a commissary kitchen. User indicated access is true.",
            "citations": ["KCBOH Title 5"],
            "required_forms": [
                {
                    "form_name": "Mobile Food Unit Plan Review",
                    "url": "https://kingcounty.gov/plan-review.pdf"
                }
            ]
        };
    }

    return { agency: agentName, status: "error", notes: "Unknown agent." };
}
//*/

// --- The Core Orchestrator Endpoint ---
app.post('/api/evaluate-permit', async (req, res) => {
    try {
        const intakeData = req.body;
        console.log(`[📦] Received payload for application: ${intakeData.application_id}`);

        if (!intakeData || Object.keys(intakeData).length === 0) {
            return res.status(400).json({ error: "Empty payload received" });
        }

        // 1. Load mock data 
        const zoningRules = "SMC 15.17.005: Food trucks cannot operate within 50 feet of a park.";
        const healthRules = "KCBOH Title 5: Open food prep requires a Level 3 permit and commissary kitchen.";

        console.log(`[⚡] Firing Domain Agents in parallel...`);
        
        // 2. Execute all agents simultaneously
        const [zoningResult, healthResult] = await Promise.all([
            callDomainAgent("Zoning Authority", zoningRules, intakeData),
            callDomainAgent("Health Department", healthRules, intakeData)
        ]);

        // 3. The Orchestrator Synthesis
        const allResults = [zoningResult, healthResult];
        const hasConflict = allResults.some(res => res.status === 'conflict');

        const finalChecklist = [];
        allResults.forEach(res => {
            if (res.required_forms) {
                finalChecklist.push(...res.required_forms);
            }
        });

        // 4. Send the FINAL response (Make sure there are no other res.json calls after this!)
        return res.status(200).json({
            status: "success",
            conflict_detected: hasConflict,
            agent_details: allResults,
            unified_checklist: finalChecklist
        });

    } catch (error) {
        console.error("[❌] Orchestrator Error:", error);
        // Only trigger this if something catastrophically breaks before the 200 response
        if (!res.headersSent) {
            return res.status(500).json({ 
                status: "error",
                message: "The Orchestrator encountered a fatal error.",
                details: error.message
            });
        }
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 PermitPilot API Gateway listening at http://localhost:${PORT}`);
    console.log(`Waiting for frontend payloads...`);
});