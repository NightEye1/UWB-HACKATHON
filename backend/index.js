require('dotenv').config({ path: '../.env.local' });
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- Initialize Supabase Client ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// --- Initialize Gemini Client ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Agent Engine (Powered by Gemini) ---
async function callDomainAgent(agentName, systemRules, userData) {
    console.log(`[🤖] Waking up ${agentName} Agent (Gemini)...`);
    try {
        // We use Gemini 1.5 Flash because it is insanely fast for hackathons
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You are the ${agentName}. Evaluate the user's application against these municipal codes: ${systemRules}. You MUST return ONLY a valid JSON object. Required schema: { "agency": "${agentName}", "status": "approved" | "conflict", "notes": "Brief explanation", "citations": ["SMC ..."], "required_forms": [{"form_name": "...", "url": "..."}] }`,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json" // This forces perfect JSON output
            }
        });

        const prompt = JSON.stringify(userData);
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        return JSON.parse(responseText);
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

        // ==========================================
        // 💾 NEW: Save to Supabase Database
        // ==========================================
        console.log(`[💾] Saving application ${intakeData.application_id} to database...`);
        const { error: dbError } = await supabase
            .from('applications')
            .insert([
                {
                    application_id: intakeData.application_id,
                    project_type: intakeData.project_type,
                    status: hasConflict ? 'Action Required' : 'Approved',
                    conflict_detected: hasConflict,
                    checklist_data: { agent_details: allResults, unified_checklist: finalChecklist }
                }
            ]);

        if (dbError) {
            console.error("[❌] Database Save Failed:", dbError.message);
            // We log the error, but we don't crash the server so the frontend still gets the checklist
        } else {
            console.log(`[✅] Application securely saved to Supabase!`);
        }
        // ==========================================

        // 4. Send the FINAL response
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

// --- Function to save application results ---
async function saveApplicationToDatabase(applicationData) {
  try {
    const { data, error } = await supabase
      .from('applications')
      .insert([
        {
          application_id: applicationData.application_id,
          project_type: applicationData.project_type,
          status: applicationData.status || 'Under Review',
          conflict_detected: applicationData.conflict_detected || false,
          checklist_data: applicationData.checklist_data,
        },
      ])
      .select();

    if (error) {
      console.error('Database insertion error:', error);
      throw error;
    }

    console.log('Application saved successfully:', data);
    return data[0];
  } catch (err) {
    console.error('Failed to save application:', err.message);
    throw err;
  }
}

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 PermitPilot API Gateway listening at http://localhost:${PORT}`);
    console.log(`Waiting for frontend payloads...`);
});