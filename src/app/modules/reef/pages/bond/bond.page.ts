import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BondsService } from '../../../../core/services/bonds.service';
import { ActivatedRoute } from '@angular/router';
import { filter, map, pluck, shareReplay } from 'rxjs/operators';
import { combineLatest } from 'rxjs/internal/observable/combineLatest';
import {
  Bond,
  BondSaleStatus,
  BondTimes,
  IProviderUserInfo,
  TokenSymbol,
  TransactionType,
} from '../../../../core/models/types';
import { ConnectorService } from '../../../../core/services/connector.service';
import { UiUtils } from '../../../../shared/utils/ui.utils';
import { ApiService } from '../../../../core/services/api.service';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { DateTimeUtil } from '../../../../shared/utils/date-time.util';
import { TokenUtil } from '../../../../shared/utils/token.util';
import { Observable, Subject, timer } from 'rxjs';
import { BondUtil } from '../../../../shared/utils/bond.util';
import { startWith } from 'rxjs/internal/operators/startWith';
import { TokenBalanceService } from '../../../../shared/service/token-balance.service';
import { tap } from 'rxjs/internal/operators/tap';

@Component({
  selector: 'app-bond',
  templateUrl: './bond.page.html',
  styleUrls: ['./bond.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BondPage {
  stakeAmount: string;

  TransactionType = TransactionType;
  UiUtils = UiUtils;
  BondUtil = BondUtil;
  TokenUtil = TokenUtil;
  BondSaleStatus = BondSaleStatus;

  timer$ = timer(0, 1000);

  bond$ = combineLatest([
    this.bondsService.bondsList$,
    this.route.params.pipe(pluck('id')),
  ]).pipe(
    map(([bonds, id]: [{ list: Bond[]; chainId: number }, string]) =>
      bonds.list.find((b) => b.id.toString() === id)
    ),
    startWith({}),
    shareReplay(1)
  );

  bondTimes$ = this.bond$.pipe(
    filter((b: Bond) => !!b && !!b.id),
    switchMap((b: Bond) => b.times$),
    shareReplay(1)
  );

  lockDurationString$ = this.bondTimes$.pipe(
    map((bondTimes) =>
      UiUtils.toMinTimespanText(bondTimes.farmStartTime, bondTimes.farmEndTime)
    )
  );

  stakedBalanceUpdate = new Subject();
  stakeTokenBalance$ = combineLatest([
    this.bond$,
    this.connectorService.providerUserInfo$,
  ]).pipe(
    switchMap(([bond, info]: [Bond, IProviderUserInfo]) =>
      this.tokenBalanceService.getTokenBalance$(
        info.address,
        bond.stake as TokenSymbol,
        bond.stakeTokenAddress
      )
    ),
    shareReplay(1)
  );

  /*private stakedBalance$ = combineLatest([
    this.bond$,
    this.bondTimes$,
    this.connectorService.providerUserInfo$,
    this.stakedBalanceUpdate.pipe(startWith(null)),
  ]).pipe(
    switchMap(
      ([bond, bondTimes, info, _]: [Bond, BondTimes, IProviderUserInfo, any]) =>
        this.bondsService.getStakedBalanceOf(bond, info.address),
      (bondInfo, balance) => ({
        bond: bondInfo[0],
        bondTimes: bondInfo[1],
        info: bondInfo[2],
        balance,
      })
    ),
    shareReplay(1)
  );
  stakedBalanceReturn$ = combineLatest([this.stakedBalance$, this.timer$]).pipe(
    map(
      // tslint:disable-next-line:variable-name
      ([bond_times_info_balance, _]: [
        {
          bond: Bond;
          bondTimes: BondTimes;
          info: IProviderUserInfo;
          balance: string;
        },
        any
      ]) => ({
        bond: bond_times_info_balance.bond,
        staked: parseFloat(bond_times_info_balance.balance),
        ...BondUtil.getBondReturn(
          bond_times_info_balance.bond,
          bond_times_info_balance.bondTimes,
          bond_times_info_balance.balance
        ),
        // totalInterestReturn: (parseFloat(bond_info_balance.bond.apy) / 100) * parseFloat(bond_info_balance.balance)
      })
    ),
    shareReplay(1)
  ) as Observable<{
    bond: Bond;
    staked: number;
    currentInterestReturn: number;
    totalInterestReturn: number;
  }>;
  timeLeftToExpired$ = combineLatest([this.bondTimes$, this.timer$]).pipe(
    map(([bond, _]) => {
      const now = new Date();
      if (
        !!bond.entryStartTime &&
        DateTimeUtil.toDate(bond.entryStartTime) > now
      ) {
        return null;
      }
      return DateTimeUtil.getPositiveTimeDiff(now, bond.entryEndTime);
    })
  );*/

  constructor(
    private route: ActivatedRoute,
    public bondsService: BondsService,
    public connectorService: ConnectorService,
    public apiService: ApiService,
    public tokenBalanceService: TokenBalanceService
  ) {}

  stake(bond: Bond, stakeAmount: string): void {
    this.bondsService.stake(bond, stakeAmount).then(
      (res) => {
        this.stakeAmount = null;
        this.stakedBalanceUpdate.next();
      },
      (err) => {
        if (err.message.indexOf('oversubscribed') > 0) {
          bond.stakeMaxAmountReached = true;
        }
      }
    );
  }
}
