import datetime
import os
from os import path

from airflow import DAG
from airflow.providers.amazon.aws.operators.ecs import ECSOperator
from airflow.operators.bash import BashOperator


dag = DAG(
    dag_id="sweep_experiment_dag",
    default_view="tree",
    schedule_interval=None,
    start_date=datetime.datetime(2022, 1, 1),
    catchup=False
)

prefix = path.join(os.environ.get("MOUNT_POINT"), "sweeps")
init_sweep = BashOperator(
    task_id="init_sweep",
    dag=dag,
    bash_command=f"echo 'wandb sweep {prefix}/{{{{ dag_run.conf['experiment_id'] }}}}/config.yaml'"
)

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
    overrides={},
    awslogs_group=os.environ.get("AWS_LOG_GROUP"),
    awslogs_region=os.environ.get("AWS_DEFAULT_REGION"),
    awslogs_stream_prefix=path.join(
        os.environ.get("AWS_LOG_STREAM_PREFIX_SWEEP"),
        "SweepContainer"    # TODO: Derive from config
    )
)

init_sweep >> run_agents
