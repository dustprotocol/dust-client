import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  HistoricRoiChartOptions,
  IBasket,
  IBasketHistoricRoi,
  IGenerateBasketResponse,
  PoolsChartOptions,
} from '../../../../core/models/types';
import { ChartsService } from '../../../../core/services/charts.service';
import { ApiService } from '../../../../core/services/api.service';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-basket',
  templateUrl: './basket.component.html',
  styleUrls: ['./basket.component.scss'],
})
export class BasketComponent {
  private mBasket: IBasket;
  private pureBasket: IGenerateBasketResponse | undefined;
  @Input() isListView: boolean;
  @Input() basketIndex: number | undefined;

  @Input() set basket(value: IBasket) {
    this.mBasket = value;
    this.pureBasket = this.getChartLabels(this.mBasket);
    this.poolChartOptions = this.charts.composeWeightAllocChart(
      Object.keys(this.pureBasket),
      Object.values(this.pureBasket)
    );
    this.getHistoricRoi(this.pureBasket, 1);
    this.calcBasketRoi(value.timeStamp, value.investedETH, this.pureBasket);
  }

  get basket(): IBasket {
    return this.mBasket;
  }

  @Output() disinvest = new EventEmitter();
  public poolChartOptions: Partial<PoolsChartOptions>;
  public roiData: number[][];
  public disinvestPercentage = 100;
  public activeTimeSpan = 1;
  public basketRoi = null;
  public totalAccrued = null;

  constructor(
    private readonly charts: ChartsService,
    private readonly apiService: ApiService
  ) {}

  onDisinvest(): void {
    const data = [this.basketIndex, this.disinvestPercentage];
    this.disinvest.emit(data);
  }

  private getChartLabels(basket: IBasket): IGenerateBasketResponse {
    const { Tokens, BalancerPools, MooniswapPools, UniswapPools } = basket;
    const names = [
      ...Tokens.pools,
      ...BalancerPools.pools,
      ...MooniswapPools.pools,
      ...UniswapPools.pools,
    ].map((p) => p.name);
    const weights = [
      ...Tokens.weights,
      ...BalancerPools.weights,
      ...MooniswapPools.weights,
      ...UniswapPools.weights,
    ];
    const temp = {};
    for (let i = 0; i < names.length; i++) {
      temp[names[i]] = weights[i];
    }
    return temp;
  }

  public getHistoricRoi(
    basket: IGenerateBasketResponse,
    subtractMonths: number
  ): Subscription {
    this.activeTimeSpan = subtractMonths;
    return this.apiService
      .getHistoricRoi(basket, subtractMonths)
      .pipe(take(1))
      .subscribe((historicRoi: IBasketHistoricRoi) => {
        this.roiData = this.charts.composeHighChart(
          this.extractRoi(historicRoi)
        );
      });
  }

  private extractRoi(obj: IBasketHistoricRoi): number[][] {
    return Object.keys(obj).map((key) => [
      new Date(key).getTime(),
      +obj[key].weighted_roi.toFixed(2),
    ]);
  }

  private calcBasketRoi(
    timestamp: number,
    investedEth: string,
    basket: IGenerateBasketResponse
  ) {
    return this.apiService
      .getHistoricRoi(basket, 0, new Date(timestamp))
      .pipe(take(1))
      .subscribe((historicRoi: IBasketHistoricRoi) => {
        const extracted = this.extractRoi(historicRoi);
        if (extracted.length) {
          this.basketRoi = extracted[extracted.length - 1][1] - extracted[0][1];
          this.totalAccrued = parseFloat(investedEth) * (this.basketRoi / 100);
        }
      });
  }
}
