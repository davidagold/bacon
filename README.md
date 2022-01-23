# Bacon

[Bacon](https://en.wikipedia.org/wiki/Francis_Bacon) (WIP) is a framework for orchestrating machine learning experiments.

A Bacon stack consists of:
- Airflow service running on ECS Fargate,
- ECS autoscaling group on which to run Weights & Biases hyperparameter sweeps
- API to trigger parallelized W&B sweep runs.


## Architecture


Sweeps are run in parallel over eight workers per EC2 instance.
Choose between [c5.9xlarge](https://aws.amazon.com/ec2/instance-types/c5/) (default) or [p2.8xlarge](https://aws.amazon.com/ec2/instance-types/p2/) instances for training.

## Prerequisites
- AWS account and user with appropriate permissions and credentials
- [Optional] Running On-demand P instances vCPU quota >= 32 (if using `p2.8xlarge` instance type)
- [Optional] An EC2 key pair with which to connect to the sweep task autoscaling group

## Installation

`$ npm install`


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

To run a W&B hyperparameter sweep experiment:
1. Navigate to the Airflow UI using the load balancer DNS Cloudformation output
2. Trigger the `sweep_dag` with a sweep experiment config
3. Monitor tasks on the `SweepCluster` ECS cluster and training data in the W & B sweep console, which can be obtained from the `init_sweep` Airflow task logs.


### Sweep experiment config schema


```
{
    "experiment_id": "my_experiment",
    "n_runs_per_task": 10,
    "sweep_config": { ... }
}
```


Where `sweep_config` follows the [W&B sweep config specification](https://docs.wandb.ai/guides/sweeps/configuration).



## Make targets




## Example




## Roadmap

Upcoming features:
- CLI for triggering sweep experiments 
- Auto generate experiment IDs
- Include model deployment support downstream of the sweep tasks
