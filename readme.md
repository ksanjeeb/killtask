<img width="615" height="137" alt="image" src="https://github.com/user-attachments/assets/f54de43b-f9a3-4ab8-86e7-ee50e6bc59f6" />


# killtask

CLI to kill processes running on specific ports.

## Usage

Kill a single port:

```
npx killtask 8080
```

Kill multiple ports:

```
npx killtask 8080 3000
```

Kill all listening ports:

```
npx killtask --all
```


## Options

* `--all` – Kill all listening ports
* `--help` – Show help
* `--version` – Show version

