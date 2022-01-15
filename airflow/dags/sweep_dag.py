import datetime
import os
from os import path

from airflow import DAG
from airflow.providers.amazon.aws.operators.ecs import ECSOperator
from airflow.operators.bash import BashOperator
from airflow.decorators import task
import wandb


dag = DAG(
    dag_id="sweep_experiment_dag",
    default_view="tree",
    schedule_interval=None,
    start_date=datetime.datetime(2022, 1, 1),
    catchup=False
)


login_wandb = BashOperator(
    task_id="init_sweep",
    dag=dag,
    bash_command="/home/airflow/.local/bin/wandb login",
    env={ "WANDB_API_KEY": os.environ.get("WANDB_API_KEY") }
)


@task(task_id="init_sweep")
def _init_sweep(sweep_config):
    return wandb.sweep(sweep_config)

init_sweep = _init_sweep("{{ dag_run.conf['sweep_config']}}")


run_agents = ECSOperator(
    task_id="run_agents",
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
                    "init.sh",
                    "{{ init_sweep.xcom_pull(task_ids='init_sweep', key='return_value') }}"
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


login_wandb >> init_sweep >> run_agents
