# Bacon

[Bacon](https://en.wikipedia.org/wiki/Francis_Bacon) (WIP) is a framework for orchestrating machine learning experiments.
A bacon stack provisions for:
- An Airflow service running on ECS Fargate,
- An ECS autoscaling group on which to run Weights & Biases hyperparameter sweeps.


## Architecture


Sweeps are run in parallel over eight workers per EC2 instance.
Choose between [c5.9xlarge](https://aws.amazon.com/ec2/instance-types/c5/) (default) or [p2.8xlarge](https://aws.amazon.com/ec2/instance-types/p2/) instances for training.

## Deployment

```
$ make deploy [contextVar=<value>...]
```

**Note**: AWS credentials and appropriate IAM permissions are required to deploy a Bacon stack.

### AWS CDK context parameters

The following context variables can be passed to `make deploy` as shown above.
- `env`: Stack environment -- suffixed to stack name (default: `staging`)
- `sweepTaskImageTag`: Tag of sweep task image (default example UNet sub-module gitsha)
- `airflowImageTag`: Tag of Airflow image (default: present gitsha)
- `sweepTaskInstanceType`: Instance Type for sweep task autoscaling group (default: `c5.9xlarge`)
- `numSweepTasks`: Number of sweep tasks to run (default: `6`)
- `maxNumInstances`: Max number of instances to run in autoscaling group (default: `1`)


## API

To run a W&B hyperparameter sweep experiment, trigger the `sweep_dag` with a config::
```
{
    "experiment_id": "my_experiment",
    "n_runs_per_task": 10,
    "sweep_config": { ... }
}
```

Where `sweep_config` follows the [W&B sweep config specification](https://docs.wandb.ai/guides/sweeps/configuration).


### Sweep experiment config schema

## Make targets


## Example




## Roadmap

Next on the docket:
- Include model deployment support downstream of the sweep tasks
- CLI for triggering sweep experiments 

