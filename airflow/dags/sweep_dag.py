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
def _init_sweep(sweep_config) -> str:
    return wandb.sweep(sweep_config)

init_sweep = _init_sweep(sweep_config="{{ dag_run.conf['sweep_config'] }}")


def run_agents(init_sweep, i):
    return ECSOperator(
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
                        init_sweep,
                        "{{ dag_run.conf.get('n_runs_per_worker', '1') }}"
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


login_wandb >> init_sweep >> [
    run_agents(init_sweep, i) for i in range(NUM_SWEEP_TASKS)
]