import datetime
import os
from os import path
import json
from typing import Dict

from airflow import DAG
from airflow.providers.amazon.aws.operators.ecs import ECSOperator
from airflow.operators.bash import BashOperator
from airflow.decorators import task
import wandb


NUM_SWEEP_TASKS = 8

dag = DAG(
    dag_id="sweep_experiment_dag",
    default_view="tree",
    schedule_interval=None,
    start_date=datetime.datetime(2022, 1, 1),
    catchup=False,
    render_template_as_native_obj=True
)


login_wandb = BashOperator(
    task_id="login_wandb",
    dag=dag,
    bash_command="/home/airflow/.local/bin/wandb login",
    env={ "WANDB_API_KEY": os.environ.get("WANDB_API_KEY") }
)


@task(task_id="init_sweep")
def init_sweep(config) -> str:
    sweep_config = config["sweep_config"]
    # env, program, args are interpolated by wandb
    sweep_config["command"] = ["${env}", "python3.9", "${program}", "${args}"]
    return wandb.sweep(sweep_config)

sweep_id = init_sweep("{{ dag_run.conf }}")


# We require this as a standalone task to cast `n_runs_per_task` as a string
# post- template rendering
@task(task_id="pull_n_runs")
def pull_n_runs_per_task(config) -> str:
    return str(config.get("n_runs_per_task", 1))


def run_agents():
    n_runs_per_task = pull_n_runs_per_task("{{ dag_run.conf) }}")

    for i in range(NUM_SWEEP_TASKS):
        yield ECSOperator(
            task_id=f"run_agents_{i}",
            dag=dag,
            aws_conn_id="aws_default",
            cluster=os.environ.get("SWEEP_AGENTS_CLUSTER"),
            launch_type="EC2",
            capacity_provider_strategy=[{
                "capacityProvider": os.environ.get("SWEEP_AGENTS_CAPACITY_PROVIDER"),
                "weight": 1,
                "base": 1
            }],
            network_configuration={
                "awsvpcConfiguration": {
                    "securityGroups": [os.environ.get("SECURITY_GROUP")],
                    "subnets": os.environ.get("SUBNET_IDS").split(",")
                }
            },
            task_definition=os.environ.get("SWEEP_TASK_DEFINITION_ARN"),
            overrides={
                "containerOverrides": [
                    {
                        "name": os.environ.get("SWEEP_CONTAINER_NAME"),
                        "command": [
                            "/bin/bash", 
                            "exp/init.sh", 
                            sweep_id,
                            n_runs_per_task
                        ]
                    }
                ]
            },
            awslogs_group=os.environ.get("AWS_LOG_GROUP"),
            awslogs_region=os.environ.get("AWS_DEFAULT_REGION"),
            awslogs_stream_prefix=path.join(
                os.environ.get("AWS_LOG_STREAM_PREFIX_SWEEP"),
                "SweepContainer"    # TODO: Derive from config
            )
        )


login_wandb >> sweep_id >> [*run_agents()]
