import fs = require("fs")
import path = require("path")

import { config } from "../config"


export const SWEEPS_DIR = path.join(config.airflow.efsMountPoint, "sweeps")
