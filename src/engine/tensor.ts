type BackwardFn = () => void;
type SoftmaxOptions = { causal?: boolean };

export class Tensor {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float64Array;
  readonly grad: Float64Array;
  private backwardFn: BackwardFn | null = null;
  private readonly parents: Tensor[] = [];

  private constructor(rows: number, cols: number, data?: Float64Array) {
    this.rows = rows;
    this.cols = cols;
    this.data = data ?? new Float64Array(rows * cols);
    this.grad = new Float64Array(rows * cols);
  }

  static zeros(rows: number, cols: number): Tensor {
    return new Tensor(rows, cols);
  }

  static from(rows: number, cols: number, values: number[]): Tensor {
    if (values.length !== rows * cols) {
      throw new Error(`shape mismatch: ${rows}x${cols} vs ${values.length}`);
    }
    return new Tensor(rows, cols, Float64Array.from(values));
  }

  at(r: number, c: number): number {
    return this.data[r * this.cols + c] as number;
  }

  private child(rows: number, cols: number, parents: Tensor[]): Tensor {
    const out = new Tensor(rows, cols);
    out.parents.push(...parents);
    return out;
  }

  private setBackward(fn: BackwardFn): void {
    this.backwardFn = fn;
  }

  matmul(other: Tensor): Tensor {
    if (this.cols !== other.rows) {
      throw new Error(`matmul shape: ${this.cols} vs ${other.rows}`);
    }
    const out = this.child(this.rows, other.cols, [this, other]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let k = 0; k < this.cols; k += 1) {
        const a = this.data[i * this.cols + k] as number;
        if (a === 0) continue;
        for (let j = 0; j < other.cols; j += 1) {
          out.data[i * other.cols + j] +=
            a * (other.data[k * other.cols + j] as number);
        }
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < other.cols; j += 1) {
          const g = out.grad[i * other.cols + j] as number;
          if (g === 0) continue;
          for (let k = 0; k < this.cols; k += 1) {
            this.grad[i * this.cols + k] +=
              g * (other.data[k * other.cols + j] as number);
            other.grad[k * other.cols + j] +=
              g * (this.data[i * this.cols + k] as number);
          }
        }
      }
    });
    return out;
  }

  add(other: Tensor): Tensor {
    const broadcast = other.rows === 1 && this.rows > 1;
    if (!broadcast && (other.rows !== this.rows || other.cols !== this.cols)) {
      throw new Error("add shape mismatch");
    }
    if (other.cols !== this.cols) throw new Error("add cols mismatch");
    const out = this.child(this.rows, this.cols, [this, other]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let j = 0; j < this.cols; j += 1) {
        const b = broadcast
          ? (other.data[j] as number)
          : (other.data[i * this.cols + j] as number);
        out.data[i * this.cols + j] =
          (this.data[i * this.cols + j] as number) + b;
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < this.cols; j += 1) {
          const g = out.grad[i * this.cols + j] as number;
          this.grad[i * this.cols + j] += g;
          if (broadcast) other.grad[j] += g;
          else other.grad[i * this.cols + j] += g;
        }
      }
    });
    return out;
  }

  mul(other: Tensor): Tensor {
    if (other.rows !== this.rows || other.cols !== this.cols) {
      throw new Error("mul shape mismatch");
    }
    const out = this.child(this.rows, this.cols, [this, other]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = (this.data[i] as number) * (other.data[i] as number);
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        this.grad[i] += (out.grad[i] as number) * (other.data[i] as number);
        other.grad[i] += (out.grad[i] as number) * (this.data[i] as number);
      }
    });
    return out;
  }

  mulScalar(s: number): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = (this.data[i] as number) * s;
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        this.grad[i] += (out.grad[i] as number) * s;
      }
    });
    return out;
  }

  relu(): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let i = 0; i < out.data.length; i += 1) {
      out.data[i] = Math.max(0, this.data[i] as number);
    }
    out.setBackward(() => {
      for (let i = 0; i < out.data.length; i += 1) {
        if ((this.data[i] as number) > 0) {
          this.grad[i] += out.grad[i] as number;
        }
      }
    });
    return out;
  }

  transpose(): Tensor {
    const out = this.child(this.cols, this.rows, [this]);
    for (let i = 0; i < this.rows; i += 1) {
      for (let j = 0; j < this.cols; j += 1) {
        out.data[j * this.rows + i] = this.data[i * this.cols + j] as number;
      }
    }
    out.setBackward(() => {
      for (let i = 0; i < this.rows; i += 1) {
        for (let j = 0; j < this.cols; j += 1) {
          this.grad[i * this.cols + j] += out.grad[j * this.rows + i] as number;
        }
      }
    });
    return out;
  }

  sum(): Tensor {
    const out = this.child(1, 1, [this]);
    let total = 0;
    for (let i = 0; i < this.data.length; i += 1) {
      total += this.data[i] as number;
    }
    out.data[0] = total;
    out.setBackward(() => {
      const g = out.grad[0] as number;
      for (let i = 0; i < this.data.length; i += 1) this.grad[i] += g;
    });
    return out;
  }

  softmaxRows(options: SoftmaxOptions = {}): Tensor {
    const out = this.child(this.rows, this.cols, [this]);
    for (let r = 0; r < this.rows; r += 1) {
      const limit = options.causal ? r + 1 : this.cols;
      let max = -Infinity;
      for (let c = 0; c < limit; c += 1) {
        max = Math.max(max, this.data[r * this.cols + c] as number);
      }
      let denom = 0;
      for (let c = 0; c < limit; c += 1) {
        const e = Math.exp((this.data[r * this.cols + c] as number) - max);
        out.data[r * this.cols + c] = e;
        denom += e;
      }
      for (let c = 0; c < limit; c += 1) {
        out.data[r * this.cols + c] =
          (out.data[r * this.cols + c] as number) / denom;
      }
      for (let c = limit; c < this.cols; c += 1) {
        out.data[r * this.cols + c] = 0;
      }
    }
    out.setBackward(() => {
      for (let r = 0; r < this.rows; r += 1) {
        const limit = options.causal ? r + 1 : this.cols;
        let dot = 0;
        for (let c = 0; c < limit; c += 1) {
          dot +=
            (out.grad[r * this.cols + c] as number) *
            (out.data[r * this.cols + c] as number);
        }
        for (let c = 0; c < limit; c += 1) {
          const p = out.data[r * this.cols + c] as number;
          this.grad[r * this.cols + c] +=
            p * ((out.grad[r * this.cols + c] as number) - dot);
        }
      }
    });
    return out;
  }

  static crossEntropyMean(logits: Tensor, targets: number[]): Tensor {
    if (targets.length !== logits.rows) {
      throw new Error("one target per logit row required");
    }
    const probs = logits.softmaxRows();
    const out = probs.child(1, 1, [probs]);
    let total = 0;
    for (let r = 0; r < logits.rows; r += 1) {
      const target = targets[r] as number;
      total += -Math.log(Math.max(probs.at(r, target), 1e-12));
    }
    out.data[0] = total / logits.rows;
    out.setBackward(() => {
      const g = (out.grad[0] as number) / logits.rows;
      for (let r = 0; r < logits.rows; r += 1) {
        const target = targets[r] as number;
        probs.grad[r * logits.cols + target] +=
          g * (-1 / Math.max(probs.at(r, target), 1e-12));
      }
    });
    return out;
  }

  static gatherRows(table: Tensor, indices: number[]): Tensor {
    const out = table.child(indices.length, table.cols, [table]);
    indices.forEach((rowIndex, i) => {
      for (let c = 0; c < table.cols; c += 1) {
        out.data[i * table.cols + c] =
          table.data[rowIndex * table.cols + c] as number;
      }
    });
    out.setBackward(() => {
      indices.forEach((rowIndex, i) => {
        for (let c = 0; c < table.cols; c += 1) {
          table.grad[rowIndex * table.cols + c] +=
            out.grad[i * table.cols + c] as number;
        }
      });
    });
    return out;
  }

  backward(): void {
    if (this.rows * this.cols !== 1) {
      throw new Error("backward starts from a scalar");
    }
    const order: Tensor[] = [];
    const seen = new Set<Tensor>();
    const visit = (t: Tensor): void => {
      if (seen.has(t)) return;
      seen.add(t);
      for (const p of t.parents) visit(p);
      order.push(t);
    };
    visit(this);
    this.grad[0] = 1;
    for (let i = order.length - 1; i >= 0; i -= 1) {
      (order[i] as Tensor).backwardFn?.();
    }
  }

  zeroGrad(): void {
    this.grad.fill(0);
  }
}
