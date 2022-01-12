import datetime
import os

from airflow import DAG
from airflow.providers.amazon.aws.operators.ecs import ECSOperator

dag = DAG(
    dag_id="sweep_experiment_dag",
    default_view="tree",
    schedule_interval=None,
    start_date=datetime.date(2022, 1, 1),
    catchup=False
)

# init_sweep = 


run_agents = ECSOperator(
    task_id="run_agents",
    dag=dag,
    aws_conn_id="aws_default",
    cluster=os.environ.get("SWEEP_AGENTS_CLUSTER"),
    launch_type="EC2",
    capacity_provider_strategy={
        "capacityProvider": os.environ.get("SWEEP_AGENTS_CAPACITY_PROVIDER"),
        "weight": 1,
        "base": 1
    },
    network_configuration={
        "awsvpcConfiguration": {
            "securityGroups": os.environ.get("SECURITY_GROUPS").split(","),
            "subnets": os.environ.get("SUBNET_IDS").split(",")
        }
    }
)