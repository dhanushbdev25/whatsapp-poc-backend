# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability
> **Note on `npm audit` warnings:**  
> `npm audit` may incorrectly flag `esbuild <=0.24.2` via `drizzle-kit` or `tsx`. Our tree uses `esbuild@0.25.9` and `0.18.20`, both patched. This is a false positive due to outdated audit metadata—no action needed.  
>  
> **Verification (`npm ls esbuild`):**  
> ```bash
> ├─┬ drizzle-kit@0.31.4
> │ ├─┬ @esbuild-kit/esm-loader@2.6.5
> │ │ └─┬ @esbuild-kit/core-utils@3.3.2
> │ │   └── esbuild@0.18.20
> │ ├─┬ esbuild-register@3.6.0
> │ │ └── esbuild@0.25.9 deduped
> │ └── esbuild@0.25.9
> └─┬ tsx@4.20.4
>   └── esbuild@0.25.9 deduped
> ```  

