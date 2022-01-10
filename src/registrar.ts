// import yaml = require("js-yaml")
import fs = require("fs")
import path = require("path")

import { SWEEPS_DIR } from "../experiments/sweep"

interface BaconEvent {
    eventType: "REGISTER" | "DEREGISTER"
    experimentType: "SWEEP"
    experimentId: string
    config: string
}

exports.handler = async (event: BaconEvent) => {
    if (event.experimentType === "SWEEP") {
        let configDir = path.join(SWEEPS_DIR, event.experimentId)
        console.log("Writing sweep config")
        try {
            fs.mkdirSync(configDir, { recursive: true })
            fs.writeFileSync(
                path.join(configDir, "sweep.yaml"),
                event.config
            )
        } catch (error) {
            console.error("Error writing sweep config: ", error)
        }
    }
}