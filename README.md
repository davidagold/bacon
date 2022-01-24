# Bacon

[Bacon](https://en.wikipedia.org/wiki/Francis_Bacon) is a framework for orchestrating machine learning experiments. The stack consists of:
- Airflow service running on ECS Fargate,
- ECS autoscaling group on which to run Weights & Biases hyperparameter sweeps
- API to trigger parallelized W&B sweep runs.

Sweeps are run in parallel over eight workers per EC2 instance.
Choose between [c5.9xlarge](https://aws.amazon.com/ec2/instance-types/c5/) (default) or [p2.8xlarge](https://aws.amazon.com/ec2/instance-types/p2/) instances for training.


## Prerequisites
- AWS account and user with appropriate permissions and credentials
- (*Optional*) Running On-demand P instances vCPU quota >= 32 (if using `p2.8xlarge` instance type)
- (*Optional*) An EC2 key pair with which to connect to the sweep task autoscaling group
- NodeJS and NPM  (the present package was developed against versions ``v14.18.1` and `v8.3.0`, respectively)
- Python `virtualenv` module and an accessible `python3.9` distribution


## Installation

`$ make install`


## Deployment

### Images (`bacon-<env>-images`)

The `-images` stack provisions for CodeBuild projects that build the requisite Docker images. 
The following command deploys the `-images` stack:

```
$ make deploy-images [env=<value>]
```


### Bacon (`bacon-<env>`)

**Note**: To deploy a Bacon stack with `env=<env>`, you must first deploy a respective `bacon-<env>-images`.

The following command deploys the main Bacon stack:

```
$ make deploy [contextVar=<value>...]
```

where `contextVar` belongs to the following options:
- `env`: Stack environment -- suffixed to stack name (default: `staging`)
- `sweepTaskImageTag`: Tag of sweep task image (default example UNet sub-module gitsha)
- `airflowImageTag`: Tag of Airflow image (default: present gitsha)
- `sweepTaskInstanceType`: Instance Type for sweep task autoscaling group (default: `c5.9xlarge`)
- `numSweepTasks`: Number of sweep tasks to run (default: `8`)
- `maxNumInstances`: Max number of instances to run in autoscaling group (default: `1`)



## API

To run a W&B hyperparameter sweep experiment:
1. Navigate to the Airflow UI using the load balancer DNS Cloudformation output
2. Trigger the `sweep_dag` with a sweep experiment config
3. Monitor tasks on the `SweepCluster` ECS cluster and training data in the W & B sweep console, which can be obtained from the `init_sweep` Airflow task logs.


### Sweep experiment config schema

A sweep experiment config passed to the `sweep_dag` trigger should contain the following fields:
- `experiment_id` (string): ID for the sweep experiment
- `n_runs_per_task` (int, *optional*): Number of runs to conduct per task (default 10)
- `sweep_config` (object): A [W&B sweep config specification](https://docs.wandb.ai/guides/sweeps/configuration).

**NOTE**: Leave the `sweep_config.command` field unset; it will be set by the `sweep_dag`.


## Example




## Make targets

- `venv`: Set up a virtual environment; requires `virtualenv` Python module installed, as well as an accessible Python 3.9 distribution
- `install`: Activate virtual environment and install Python dependencies
- `image-airflow`: Build Airflow service image
- `image-registrar`: Build registrar function image
- `deploy-images`: Deploy `-images` stack; see **Deployment** section
- `deploy`: Deploy Bacon stack; see **Deployment** section
- `test-dag`: Activate virtual environment and validate the `sweep_dag`
- `clean`: Clean the virtual environment and `dist` output


## Roadmap

Upcoming features:
- CLI for triggering sweep experiments 
- Auto generate experiment IDs
- Include model deployment support downstream of the sweep tasks
