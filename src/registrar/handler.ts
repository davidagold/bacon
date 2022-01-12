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

exports.main = async (event: BaconEvent) => {
    if (event.experimentType === "SWEEP") {
        let sweepConfigDir = path.join(SWEEPS_DIR, event.experimentId)
        console.log("Writing sweep config")
        try {
            fs.mkdirSync(sweepConfigDir, { recursive: true })
            fs.writeFileSync(
                path.join(sweepConfigDir, "sweep.yaml"),
                event.config
            )
        } catch (error) {
            console.error("Error writing sweep config: ", error)
        }
    }
}