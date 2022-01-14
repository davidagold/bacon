# Bacon
[Bacon](https://en.wikipedia.org/wiki/Francis_Bacon) is a framework for orchestrating machine learning experiments.
It includes an AWS CloudFormation template that provisions for:
- An Airflow service running on ECS Fargate,
- EC2 task instances on which to run Weights & Biases hyperparameter sweeps.

To run a W&B hyperparameter sweep experiment, trigger the `sweep_dag` with a config
```json
{
    "experiment_id": "my_experiment",
    "sweep_config": <sweep_config_json>
}
```
Where `<sweep_config_json>` follows the [W&B sweep config specification](https://docs.wandb.ai/guides/sweeps/configuration).
Sweeps are run in parallel over eight workers per EC2 instance.
Choose between [c5.9xlarge](https://aws.amazon.com/ec2/instance-types/c5/) (default) or [p2.8xlarge](https://aws.amazon.com/ec2/instance-types/p2/) instances for training.

Next on the docket:
- Include model deployment support downstream of the sweep tasks
- CLI for triggering sweep experiments 

