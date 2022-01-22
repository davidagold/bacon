# Bacon
[Bacon](https://en.wikipedia.org/wiki/Francis_Bacon) (WIP) is a framework for orchestrating machine learning experiments.
A bacon stack provisions for:
- An Airflow service running on ECS Fargate,
- EC2 task instances on which to run Weights & Biases hyperparameter sweeps.

## Architecture


Sweeps are run in parallel over eight workers per EC2 instance.
Choose between [c5.9xlarge](https://aws.amazon.com/ec2/instance-types/c5/) (default) or [p2.8xlarge](https://aws.amazon.com/ec2/instance-types/p2/) instances for training.

## API

To run a W&B hyperparameter sweep experiment, trigger the `sweep_dag` with a config::
```
{
    "experiment_id": "my_experiment",
    "n_runs_per_worker": 10,
    "sweep_config": { ... }
}
```

Where `sweep_config` follows the [W&B sweep config specification](https://docs.wandb.ai/guides/sweeps/configuration).


### Sweep experiment config schema




## Roadmap

Next on the docket:
- Include model deployment support downstream of the sweep tasks
- CLI for triggering sweep experiments 

