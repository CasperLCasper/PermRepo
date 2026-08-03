// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/**
 * @title PermRepoSubscription
 *
 * @notice
 * USDC subscription contract for PermRepo.
 *
 * User pays:
 *
 *      2 USDC / 30 days
 *
 * Subscription gives permission to execute
 * GitHub Actions backup workflow.
 *
 *
 * IMPORTANT:
 *
 * - No ETH
 * - No Chainlink
 * - No oracle
 * - No price conversion
 *
 * Base USDC only.
 */
contract PermRepoSubscription is
    Ownable2Step,
    ReentrancyGuard
{

    using SafeERC20 for IERC20;


    // ==================================================
    // CONSTANTS
    // ==================================================


    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;


    /**
     * USDC has 6 decimals.
     *
     * 2 USDC =
     * 2 * 10^6
     */
    uint256 public constant SUBSCRIPTION_PRICE = 2_000_000;



    // ==================================================
    // IMMUTABLES
    // ==================================================


    IERC20 public immutable USDC;



    // ==================================================
    // STORAGE
    // ==================================================


    /**
     * user =>
     * subscription expiration timestamp
     */
    mapping(address => uint256)
        public subscriptionExpiry;



    /**
     * Total received USDC.
     */
    uint256 public totalRevenue;



    // ==================================================
    // EVENTS
    // ==================================================


    event SubscriptionPurchased(
        address indexed user,
        uint256 activeUntil,
        uint256 amount
    );


    event SubscriptionRenewed(
        address indexed user,
        uint256 activeUntil,
        uint256 amount
    );


    event RevenueWithdrawn(
        address indexed owner,
        uint256 amount
    );



    // ==================================================
    // ERRORS
    // ==================================================


    error ZeroAddress();


    error NotSubscribed();


    error NothingToWithdraw();



    // ==================================================
    // CONSTRUCTOR
    // ==================================================


    constructor(
        address usdcAddress
    )
        Ownable(msg.sender)
    {

        if(
            usdcAddress == address(0)
        )
        {
            revert ZeroAddress();
        }


        USDC =
            IERC20(usdcAddress);
    }



    // ==================================================
    // USER FUNCTIONS
    // ==================================================



    /**
     * @notice
     *
     * User approves USDC first:
     *
     * USDC.approve(
     *      subscriptionContract,
     *      2000000
     * )
     *
     * Then calls:
     *
     * subscribe()
     */
    function subscribe()
        external
        nonReentrant
    {


        USDC.safeTransferFrom(
            msg.sender,
            address(this),
            SUBSCRIPTION_PRICE
        );



        uint256 currentExpiry =
            subscriptionExpiry[msg.sender];



        uint256 start;


        if(
            currentExpiry > block.timestamp
        )
        {
            start =
                currentExpiry;
        }
        else
        {
            start =
                block.timestamp;
        }



        uint256 newExpiry =
            start +
            SUBSCRIPTION_PERIOD;



        subscriptionExpiry[msg.sender]
            =
            newExpiry;



        totalRevenue +=
            SUBSCRIPTION_PRICE;



        emit SubscriptionPurchased(
            msg.sender,
            newExpiry,
            SUBSCRIPTION_PRICE
        );

    }





    /**
     * @notice
     * Check if user can execute backups.
     */
    function isSubscribed(
        address user
    )
        public
        view
        returns(bool)
    {

        return
            subscriptionExpiry[user]
            >
            block.timestamp;
    }





    function getSubscriptionExpiry(
        address user
    )
        external
        view
        returns(uint256)
    {

        return
            subscriptionExpiry[user];

    }




    // ==================================================
    // OWNER FUNCTIONS
    // ==================================================



    function withdrawUSDC()
        external
        onlyOwner
        nonReentrant
    {


        uint256 balance =
            USDC.balanceOf(
                address(this)
            );


        if(
            balance == 0
        )
        {
            revert NothingToWithdraw();
        }



        USDC.safeTransfer(
            owner(),
            balance
        );



        emit RevenueWithdrawn(
            owner(),
            balance
        );

    }



}
