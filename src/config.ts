import {InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import cdk = require("aws-cdk-lib")

export interface AirflowTaskConfig {
    readonly cpu: number;
    readonly memoryLimitMiB: number;
    readonly webserver: ContainerConfig;
    readonly scheduler: ContainerConfig;
    readonly worker: ContainerConfig;
    readonly logRetention: RetentionDays;
    readonly createWorkerPool?: boolean;
    readonly dagsFolder: string; 
}

export interface AutoScalingConfig {
    readonly maxTaskCount: number;
    readonly minTaskCount: number;
    readonly cpuUsagePercent?: number;
    readonly memUsagePercent?: number;
}

export interface ContainerConfig {
    readonly name: string;
    readonly cpu?: number;
    readonly memoryLimitMiB?: number;
    readonly containerPort: number;
    readonly entryPoint: string;
}

export interface RdsConfig {
    readonly dbName: string;
    readonly masterUsername: string;
    readonly port: number;
    readonly instanceType: InstanceType;
    readonly allocatedStorageInGB: number;
    readonly backupRetentionInDays: number;
}

export interface Config {
    readonly N_SWEEP_TASKS: number,
    readonly EFS_MOUNT_POINT: string,
    readonly airflow: AirflowTaskConfig
    readonly workerAutoScaling: AutoScalingConfig
    readonly rds: RdsConfig
}

const defaultWebserverConfig: ContainerConfig = {
    name: "WebserverContainer",
    containerPort: 8080,
    entryPoint: "/bootstrap/webserver.sh"
}

const defaultSchedulerConfig: ContainerConfig = {
    name: "SchedulerContainer",
    containerPort: 8081,
    entryPoint: "/bootstrap/scheduler.sh"
}

const defaultWorkerConfig: ContainerConfig = {
    name: "WorkerContainer",
    containerPort: 8082,
    entryPoint: "/bootstrap/worker.sh"
}

const EFS_MOUNT_POINT = "/mnt/efs"
export const config: Config = {
    EFS_MOUNT_POINT: EFS_MOUNT_POINT,
    N_SWEEP_TASKS: 8,
    airflow: {
        cpu: 1024,
        memoryLimitMiB: 1536,
        webserver: defaultWebserverConfig,
        scheduler: defaultSchedulerConfig,
        worker: defaultWorkerConfig,
        logRetention: RetentionDays.ONE_MONTH,
        createWorkerPool: false,
        dagsFolder: `${EFS_MOUNT_POINT}/dags`
    },
    workerAutoScaling: {
        minTaskCount: 1,
        maxTaskCount: 5,
        cpuUsagePercent: 70
    },
    rds: {
        dbName: "bacon",
        port: 5432,
        masterUsername: "airflow",
        instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.SMALL),
        allocatedStorageInGB: 25,
        backupRetentionInDays: 30
    }
}